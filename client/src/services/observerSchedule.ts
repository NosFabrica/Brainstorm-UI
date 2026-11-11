/**
 * The relay and signer half of the Observer's morning schedule, a NIP-FB scheduled task
 * (`lib/scheduledTasks` holds the format and the edits, `lib/frontPage/observerSchedule`
 * its address). Reads fill the EventStore (docs/adr/0005); an edit is a read-modify-write
 * that asks the relays first, because it replaces the event: the newest copy any of the
 * author's write relays holds, read to EOSE, or the store's copy when that is newer.
 * Unless more than half of those relays answered, nothing is written, even with a copy in
 * the store (NIP-FB's Editing: "don't write if the relays couldn't be read", held to the
 * quorum its devices run by): the devices race to claim each morning on those relays, and
 * an edit built without a claim one of them holds would, being newer, cancel that run.
 * Nor is anything written when the content doesn't decrypt to a tag array.
 *
 * The decrypted schedule never goes to a log.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { beats, requestNewestWithReach } from "@/lib/relayRequest";
import { outboxRelays } from "@/lib/relayRouting";
import { OBSERVER_TASK, SCHEDULE_D, SCHEDULE_KIND, emptyObserverSchedule } from "@/lib/frontPage/observerSchedule";
import { withTaskName, type TaskTags } from "@/lib/scheduledTasks";
import { decodePrivateTags } from "@/lib/agentKeys";
import {
  activeAccount,
  decryptFromSelf,
  encryptToSelf,
  signAs,
  signingFailure,
  type PublishOutcome,
} from "@/accounts/signing";
import type { BrainstormAccount } from "@/accounts/metadata";
import { publishToRelays } from "@/services/nostr";

/**
 * Decrypted tags by event id, so a schedule this session just wrote, or already
 * read, isn't decrypted again (an extension or bunker asks its user each time). Only
 * ever filled with the author's own event, read with their own key.
 */
const decrypted = new Map<string, TaskTags>();
const MAX_HELD = 16;

function remember(id: string, doc: TaskTags) {
  decrypted.set(id, doc);
  if (decrypted.size > MAX_HELD) decrypted.delete(decrypted.keys().next().value!);
}

/** The schedule's filter: one author's one event. */
export function scheduleFilter(pubkey: string) {
  return { kinds: [SCHEDULE_KIND], authors: [pubkey], "#d": [SCHEDULE_D] };
}

/** The user's morning schedule into the store: the ask behind `useObserverSchedule`. */
export async function loadObserverSchedule(pubkey: string, timeoutMs = 6000): Promise<NostrEvent | undefined> {
  const relays = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: Math.min(timeoutMs, 2500) }).catch(
    () => PROFILE_RELAYS,
  );
  const event = await loadReplaceable(SCHEDULE_KIND, pubkey, { identifier: SCHEDULE_D, relays, timeoutMs });
  return event ?? (eventStore.getReplaceable(SCHEDULE_KIND, pubkey, SCHEDULE_D) as NostrEvent | undefined);
}

/**
 * The event's tags, both sides: its public ones (without `d`) and its private ones,
 * decrypted (none when the content is empty). Null when this Account can't read the
 * private ones, or they aren't a tag list: never guessed at, so never rewritten.
 */
export async function decryptSchedule(account: BrainstormAccount, event: NostrEvent): Promise<TaskTags | null> {
  if (event.pubkey !== account.pubkey) return null;
  const held = decrypted.get(event.id);
  if (held) return held;
  const publicTags = event.tags.filter((t) => t[0] !== "d");
  let privateTags: string[][] = [];
  if (event.content) {
    const plain = await decryptFromSelf(account, event.content);
    const read = plain === null ? null : decodePrivateTags(plain);
    if (!read) return null;
    privateTags = read;
  }
  const tags = { public: publicTags, private: privateTags };
  remember(event.id, tags);
  return tags;
}

export type ScheduleSave = PublishOutcome & { doc?: TaskTags };

/**
 * Rewrites the schedule as `change(current)`: every tag `change` leaves alone stays as
 * it was, on its side (public or private). Fails, writing nothing, when half or fewer of
 * the write relays answered, when the newest copy can't be read, or when `change` refuses
 * (it throws on a time that isn't one). `claim` and `ran` are only ever carried over.
 */
export async function updateObserverSchedule(change: (doc: TaskTags) => TaskTags): Promise<ScheduleSave> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const relays = await outboxRelays(account.pubkey, PROFILE_RELAYS).catch(() => PROFILE_RELAYS);
    const { newest: fetched, reach } = await requestNewestWithReach(relays, scheduleFilter(account.pubkey), 6000);
    // The store can hold a newer copy than the relays that answered (one this session
    // just wrote): rewriting from the older read would undo it.
    const held = eventStore.getReplaceable(SCHEDULE_KIND, account.pubkey, SCHEDULE_D) as NostrEvent | undefined;
    const newest = held && beats(held, fetched) ? held : fetched;

    if (reach.answered.length * 2 <= reach.asked.length) {
      return { success: false, error: "Too few of your relays answered, so nothing was changed. Try again." };
    }
    let doc: TaskTags;
    if (newest) {
      const read = await decryptSchedule(account, newest);
      if (!read) return { success: false, error: "Couldn't read your schedule, so nothing was changed." };
      doc = read;
    } else {
      doc = emptyObserverSchedule();
    }

    let next: TaskTags;
    try {
      // `task` is required: a copy that lost it gets the one its `d` fixes.
      next = withTaskName(change(doc), OBSERVER_TASK);
    } catch (err) {
      return { success: false, error: err instanceof RangeError ? err.message : "That change can't be made." };
    }

    // Always the JSON, `[]` included: NIP-44 can't encrypt an empty string.
    const ciphertext = await encryptToSelf(account, JSON.stringify(next.private));
    if (!ciphertext) return { success: false, error: "Could not encrypt" };

    const now = Math.floor(Date.now() / 1000);
    // `d`, then the public tags as they were (`signAs` adds no client tag to this kind).
    const signed = await signAs(account, {
      kind: SCHEDULE_KIND,
      tags: [["d", SCHEDULE_D], ...next.public],
      content: ciphertext,
      // Past the copy we read, so relays keep this one even when this clock lags.
      created_at: newest ? Math.max(now, newest.created_at + 1) : now,
    });
    remember(signed.id, next);
    const outcome = await publishToRelays(signed, relays, { need: 1, timeoutMs: 8000 });
    return outcome.success ? { ...outcome, doc: next } : outcome;
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}
