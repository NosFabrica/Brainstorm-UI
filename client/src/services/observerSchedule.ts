/**
 * The relay and signer half of the Observer's morning schedule, a NIP-FB scheduled task
 * (`lib/scheduledTasks` holds the format and the edits, `lib/frontPage/observerSchedule`
 * its address). Reads fill the EventStore (docs/adr/0005).
 *
 * An edit is NIP-FB's Editing, on the user's NIP-65 write relays and nothing else (never
 * our fallback set, which the devices don't race on): read the newest copy to EOSE (or
 * the store's, when that is newer), change it, publish it back to the same relays. More
 * than half of them must answer the read and more than half must take the write, or the
 * edit fails: the devices claim each morning on those relays, and an edit built without a
 * claim one of them holds would, being newer, cancel that run. With no relay list, or one
 * naming no write relay, nothing is written. Nor is anything written when the content
 * doesn't decrypt to a tag array.
 *
 * The decrypted schedule never goes to a log.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { PROFILE_RELAYS } from "@/lib/relays";
import { pool } from "@/lib/relayPool";
import { publishUntilEnough } from "@/lib/publishQuorum";
import { beats, requestNewestWithReach } from "@/lib/relayRequest";
import { dedupeRelays, loadFreshRelayList, loadRelayList } from "@/lib/relayRouting";
import { OBSERVER_TASK, SCHEDULE_D, SCHEDULE_KIND, emptyObserverSchedule } from "@/lib/frontPage/observerSchedule";
import { withTaskName, withoutPublicClient, type TaskTags } from "@/lib/scheduledTasks";
import { decodePrivateTags } from "@/lib/agentKeys";
import {
  activeAccount,
  encryptToSelf,
  hasExternalSigner,
  signAs,
  signingFailure,
  type PublishOutcome,
} from "@/accounts/signing";
import { classifySignerError } from "@/accounts/signer-errors";
import { NoUnlockPathError } from "@/accounts/local-signer";
import type { BrainstormAccount } from "@/accounts/metadata";

/**
 * What reading an event's tags came to:
 * - `ready`: both sides, the private ones decrypted.
 * - `unreadable`: this Account can't read it (someone else's, a ciphertext its key doesn't
 *   open, or plaintext that isn't a tag array). It stays that way, so it is remembered.
 * - `failed`: the signer didn't decrypt (a bunker that timed out, an extension prompt
 *   dismissed). Worth asking again, so it isn't remembered.
 */
export type ScheduleRead =
  { status: "ready"; tags: TaskTags } | { status: "unreadable" } | { status: "failed"; error: string };

/**
 * Settled reads by event id (a schedule this session wrote, or already read, isn't
 * decrypted again: an extension or bunker asks its user each time), and the reads still
 * out, so a second ask for the same event joins the first. Only ever filled with the
 * author's own event, read with their own key.
 */
const settled = new Map<string, ScheduleRead>();
const pending = new Map<string, Promise<ScheduleRead>>();
const MAX_HELD = 16;

const majority = (n: number) => Math.floor(n / 2) + 1;

function remember(id: string, read: ScheduleRead) {
  settled.set(id, read);
  if (settled.size > MAX_HELD) settled.delete(settled.keys().next().value!);
}

/** The schedule's filter: one author's one event. */
export function scheduleFilter(pubkey: string) {
  return { kinds: [SCHEDULE_KIND], authors: [pubkey], "#d": [SCHEDULE_D] };
}

/** When the relays last answered the schedule's read, per author (ms). */
const answeredAt = new Map<string, number>();

/**
 * When the relays last answered for `pubkey`'s schedule (ms): more than half of their write
 * relays (or, with no relay list, of those asked) reached EOSE. Null before any did. A read
 * that timed out isn't an answer, so it never moves this: what a missed-run warning rests on.
 */
export function scheduleCheckedAt(pubkey: string): number | null {
  return answeredAt.get(pubkey) ?? null;
}

/**
 * The user's morning schedule into the store: the ask behind `useObserverSchedule`. Always
 * the relays, never only the store's copy: what a device wrote this morning (its `ran`) is
 * the point of reading it, and a copy kept from yesterday would read as a missed morning.
 * Read to EOSE on their write relays (and the profile floor), newest wins, and the time is
 * recorded only when most of the write relays answered (`scheduleCheckedAt`).
 */
export async function loadObserverSchedule(pubkey: string, timeoutMs = 6000): Promise<NostrEvent | undefined> {
  const list = await loadRelayList(pubkey, { timeoutMs: Math.min(timeoutMs, 2500) }).catch(() => null);
  const write = dedupeRelays(list?.write ?? []);
  const relays = dedupeRelays([...write, ...PROFILE_RELAYS]);
  // Settled by their own relays: a fallback relay that is slow or down keeps looking in
  // the background, and a copy only it holds lands in the store when it comes.
  const { newest, reach } = await requestNewestWithReach(relays, scheduleFilter(pubkey), timeoutMs, {
    settleOn: write,
  });
  const counted = write.length ? write : relays;
  if (reach.answered.filter((url) => counted.includes(url)).length >= majority(counted.length)) {
    answeredAt.set(pubkey, Date.now());
  }
  return newest ?? (eventStore.getReplaceable(SCHEDULE_KIND, pubkey, SCHEDULE_D) as NostrEvent | undefined);
}

async function readOnce(account: BrainstormAccount, event: NostrEvent): Promise<ScheduleRead> {
  const publicTags = event.tags.filter((t) => t[0] !== "d");
  if (!event.content) return { status: "ready", tags: { public: publicTags, private: [] } };
  if (!account.nip44) return { status: "unreadable" };
  let plain: string;
  try {
    plain = await account.nip44.decrypt(account.pubkey, event.content);
  } catch (error) {
    const kind = classifySignerError(error);
    // They declined to unlock: the caller keeps it locked.
    if (kind === "cancelled") throw error;
    // A key held here with no way to unlock it in this browser now: that can change (a
    // prompt installed, a password set), so it is asked again, never remembered.
    if (error instanceof NoUnlockPathError) {
      return { status: "failed", error: "Your key couldn't be unlocked in this browser." };
    }
    // A key held here that can't open it never will; nor will a signer that tried.
    if (!hasExternalSigner(account) || kind === "bad-payload") return { status: "unreadable" };
    return { status: "failed", error: signingFailure(error, "Your signer didn't decrypt the schedule.").error! };
  }
  const read = typeof plain === "string" ? decodePrivateTags(plain) : null;
  return read ? { status: "ready", tags: { public: publicTags, private: read } } : { status: "unreadable" };
}

/** The read of `eventId` this session already settled, if it has: no signer asked. */
export function heldSchedule(eventId: string): ScheduleRead | undefined {
  return settled.get(eventId);
}

/**
 * The event's tags, both sides: its public ones (without `d`) and its private ones,
 * decrypted (none when the content is empty). Never guessed at, so never rewritten from a
 * guess. One decrypt per event: a read already out is joined, a settled one reused, and
 * only a signer failure is asked again. Rethrows a declined unlock.
 */
export function readSchedule(account: BrainstormAccount, event: NostrEvent): Promise<ScheduleRead> {
  if (event.pubkey !== account.pubkey) return Promise.resolve({ status: "unreadable" });
  const held = settled.get(event.id);
  if (held) return Promise.resolve(held);
  const out = pending.get(event.id);
  if (out) return out;
  const read = readOnce(account, event).then(
    (result) => {
      pending.delete(event.id);
      if (result.status !== "failed") remember(event.id, result);
      return result;
    },
    (error) => {
      pending.delete(event.id);
      throw error;
    },
  );
  pending.set(event.id, read);
  return read;
}

/**
 * What a save came to; on success, the event it wrote (or, for a change that was none, the
 * copy it made sure most relays hold). `retryable`: trying again may work (a relay or the
 * relay list didn't answer, too few took it); otherwise it won't until something changes.
 */
export type ScheduleSave = PublishOutcome & { doc?: TaskTags; id?: string; createdAt?: number; retryable?: boolean };

/**
 * The user's NIP-65 write relays (all of them, nothing added), from a fresh read of their
 * relay list: a held copy from before they added a relay would count the quorum short.
 * `none` when the list names no write relay or there is no list; `unavailable` when it
 * couldn't be loaded.
 */
async function writeRelaysOf(
  pubkey: string,
): Promise<{ status: "ok"; relays: string[] } | { status: "none" } | { status: "unavailable" }> {
  const read = await loadFreshRelayList(pubkey).catch(() => ({ status: "unavailable" }) as const);
  if (read.status !== "found") return read;
  const write = dedupeRelays(read.list.write);
  return write.length ? { status: "ok", relays: write } : { status: "none" };
}

/** Publishes `event` to `relays` until `need` take it, all at once. */
function publishTo(relays: string[], event: NostrEvent, need: number) {
  return publishUntilEnough(
    relays,
    (url) =>
      pool
        .relay(url)
        .publish(event, { timeout: 8000 })
        .then((r) => ({ ok: r.ok, from: url, message: r.message })),
    { need, timeoutMs: 8000 },
  );
}

/**
 * Rewrites the schedule as `change(current)`: every tag `change` leaves alone stays as
 * it was, on its side (public or private). Fails, writing nothing, without write relays,
 * when half or fewer of them answered the read, when the newest copy can't be read, or
 * when `change` refuses (it throws on a time that isn't one); and fails when half or fewer
 * took the write. Succeeds, signing nothing, when `change` hands back the tags it was
 * given, once the copy it read is on more than half of them (republished, as it is, to
 * those that lack it). `claim` and `ran` are only ever carried over; a public `client` tag is the one
 * tag dropped.
 */
export async function updateObserverSchedule(change: (doc: TaskTags) => TaskTags): Promise<ScheduleSave> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const found = await writeRelaysOf(account.pubkey);
    if (found.status === "unavailable") {
      return {
        success: false,
        retryable: true,
        error: "Couldn't load your relay list, so nothing was changed. Try again.",
      };
    }
    if (found.status === "none") {
      return {
        success: false,
        error:
          "Your relay list names no write relays, so there's nowhere your devices would see this. Add write relays to your relay list, then try again.",
      };
    }
    const relays = found.relays;
    const need = majority(relays.length);
    const {
      newest: fetched,
      reach,
      sentBy,
    } = await requestNewestWithReach(relays, scheduleFilter(account.pubkey), 6000);
    // "Nothing there" means no schedule only when most of them said so.
    if (reach.answered.length < need) {
      return {
        success: false,
        retryable: true,
        error: `Only ${reach.answered.length} of your ${relays.length} write relays answered, so nothing was changed. Try again.`,
      };
    }
    // The store can hold a newer copy than the relays that answered (one this session
    // just wrote): rewriting from the older read would undo it.
    const held = eventStore.getReplaceable(SCHEDULE_KIND, account.pubkey, SCHEDULE_D) as NostrEvent | undefined;
    const newest = held && beats(held, fetched) ? held : fetched;

    let doc: TaskTags;
    if (newest) {
      const read = await readSchedule(account, newest);
      if (read.status === "failed") return { success: false, error: read.error };
      if (read.status !== "ready")
        return { success: false, error: "Couldn't read your schedule, so nothing was changed." };
      doc = read.tags;
    } else {
      doc = emptyObserverSchedule();
    }

    let changed: TaskTags;
    try {
      changed = change(doc);
    } catch (err) {
      return { success: false, error: err instanceof RangeError ? err.message : "That change can't be made." };
    }
    // No change (`change` handed back what it was given, as confirming the time shown
    // does): nothing to sign, and when `cron` was set stays. But the newest copy may be one
    // most relays never took (a save that reached one of three, retried): then it goes, the
    // same event, to the relays that lack it, and the quorum holds for it as for an edit.
    if (changed === doc) {
      if (!newest) return { success: true };
      const holding = (sentBy?.[newest.id] ?? []).filter((url) => reach.answered.includes(url));
      if (holding.length >= need) return { success: true };
      const missing = relays.filter((url) => !holding.includes(url));
      const { accepted } = await publishTo(missing, newest, need - holding.length);
      const total = holding.length + accepted.length;
      if (total < need) {
        return {
          success: false,
          retryable: true,
          accepted: total,
          total: relays.length,
          error: `Your last change is on only ${total} of your ${relays.length} write relays, so your devices may not see it. Try again.`,
        };
      }
      eventStore.add(newest);
      return {
        success: true,
        relay: holding[0] ?? accepted[0],
        accepted: total,
        total: relays.length,
        doc,
        id: newest.id,
        createdAt: newest.created_at,
      };
    }
    // `task` is required: a copy that lost it gets the one its `d` fixes. A public
    // `client` tag (Amethyst used to add one) is dropped: NIP-FB says to keep every tag but
    // `d` private (SHOULD), and this one would say which app they schedule with.
    const next = withoutPublicClient(withTaskName(changed, OBSERVER_TASK));

    // Always the JSON, `[]` included: NIP-44 can't encrypt an empty string.
    const ciphertext = await encryptToSelf(account, JSON.stringify(next.private));
    if (!ciphertext) return { success: false, error: "Could not encrypt" };

    const now = Math.floor(Date.now() / 1000);
    // `d`, then the public tags as they were, less any `client` (`signAs` adds none to this kind).
    const signed = await signAs(account, {
      kind: SCHEDULE_KIND,
      tags: [["d", SCHEDULE_D], ...next.public],
      content: ciphertext,
      // Past the copy we read, so relays keep this one even when this clock lags.
      created_at: newest ? Math.max(now, newest.created_at + 1) : now,
    });
    remember(signed.id, { status: "ready", tags: next });

    const { accepted, failed } = await publishTo(relays, signed, need);
    // Not into the store unless it took: a write the reader is told failed shouldn't show
    // as saved, and their edit stays to save again (the relays that did take it hand it
    // to the next read, which builds on it).
    if (accepted.length < need) {
      return {
        success: false,
        retryable: true,
        accepted: accepted.length,
        total: relays.length,
        error: accepted.length
          ? `Only ${accepted.length} of your ${relays.length} write relays took the change. Try again.`
          : `None of your write relays took the change${failed[0]?.message ? ` (${failed[0].message})` : ""}. Try again.`,
      };
    }
    eventStore.add(signed);
    return {
      success: true,
      relay: accepted[0],
      accepted: accepted.length,
      total: relays.length,
      doc: next,
      id: signed.id,
      createdAt: signed.created_at,
    };
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}
