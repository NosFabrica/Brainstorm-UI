/**
 * The relay and signer half of the user's AI agent keys (lib/agentKeys holds the
 * format). Reads fill the EventStore (docs/adr/0005); an edit is a read-modify-write
 * that asks the relays first, because it replaces the event, and refuses to write
 * when it can't tell what is there: a replaceable event overwritten from a blank
 * guess loses every key the user saved from another app.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { loadReplaceable } from "@/lib/loaders";
import { PROFILE_RELAYS } from "@/lib/relays";
import { beats, requestNewestWithReach } from "@/lib/relayRequest";
import { outboxRelays } from "@/lib/relayRouting";
import {
  AGENT_KEYS_KIND,
  decodePrivateTags,
  modelsRequest,
  parseAgentKeys,
  readTestAnswer,
  withAgentKeys,
  type AgentKey,
  type KeyTestResult,
} from "@/lib/agentKeys";
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
import { publishToRelays } from "@/services/nostr";

/** The user's kind 12000 into the store: the ask behind `useAgentKeys`. */
export async function loadAgentKeys(pubkey: string, timeoutMs = 6000): Promise<NostrEvent | undefined> {
  const relays = await outboxRelays(pubkey, PROFILE_RELAYS, { timeoutMs: Math.min(timeoutMs, 2500) }).catch(
    () => PROFILE_RELAYS,
  );
  const event = await loadReplaceable(AGENT_KEYS_KIND, pubkey, { relays, timeoutMs });
  return event ?? (eventStore.getReplaceable(AGENT_KEYS_KIND, pubkey) as NostrEvent | undefined);
}

/**
 * Decrypts by event id: the ones read (an extension or bunker asks its user each time),
 * and the ones still out, which a second ask joins instead of starting another. A read
 * that came to nothing isn't kept, so asking again (Unlock, Retry) tries again.
 */
const readKeys = new Map<string, string[][]>();
const readingKeys = new Map<string, Promise<AgentKeyRead>>();
const MAX_READ = 8;

/**
 * What reading the keys came to: their private tags; `unreadable`, this Account can't read
 * them (someone else's, a ciphertext its key doesn't open, plaintext that isn't a tag
 * array); or `failed`, the signer didn't decrypt (a bunker that went quiet, an extension
 * that errored, a key here with no way to unlock it in this browser), worth asking again.
 */
export type AgentKeyRead =
  { status: "ready"; tags: string[][] } | { status: "unreadable" } | { status: "failed"; error: string };

async function readOnce(account: BrainstormAccount, event: NostrEvent): Promise<AgentKeyRead> {
  if (!account.nip44) return { status: "unreadable" };
  let plain: string;
  try {
    plain = await account.nip44.decrypt(account.pubkey, event.content);
  } catch (error) {
    const kind = classifySignerError(error);
    // They declined to unlock: the caller keeps it locked.
    if (kind === "cancelled") throw error;
    if (error instanceof NoUnlockPathError) {
      return { status: "failed", error: "Your key couldn't be unlocked in this browser." };
    }
    // A key held here that can't open it never will; nor will a signer that tried.
    if (!hasExternalSigner(account) || kind === "bad-payload") return { status: "unreadable" };
    return { status: "failed", error: signingFailure(error, "Your signer didn't decrypt your keys.").error! };
  }
  const tags = typeof plain === "string" ? decodePrivateTags(plain) : null;
  return tags ? { status: "ready", tags } : { status: "unreadable" };
}

/** The event's private tags, read once per event (`AgentKeyRead`). Rethrows a declined unlock. */
export function readAgentKeyTags(account: BrainstormAccount, event: NostrEvent): Promise<AgentKeyRead> {
  if (event.pubkey !== account.pubkey || !event.content) return Promise.resolve({ status: "unreadable" });
  const done = readKeys.get(event.id);
  if (done) return Promise.resolve({ status: "ready", tags: done });
  const out = readingKeys.get(event.id);
  if (out) return out;
  const read = readOnce(account, event).then(
    (result) => {
      readingKeys.delete(event.id);
      if (result.status === "ready") {
        readKeys.set(event.id, result.tags);
        if (readKeys.size > MAX_READ) readKeys.delete(readKeys.keys().next().value!);
      }
      return result;
    },
    (error) => {
      readingKeys.delete(event.id);
      throw error;
    },
  );
  readingKeys.set(event.id, read);
  return read;
}

/** The event's private tags, decrypted; null when they can't be read, for whatever reason. One decrypt per event. */
export function decryptAgentKeyTags(account: BrainstormAccount, event: NostrEvent): Promise<string[][] | null> {
  return readAgentKeyTags(account, event).then((read) => (read.status === "ready" ? read.tags : null));
}

/**
 * Replaces the keys with `change(current)`, keeping every private tag that isn't a
 * key and the event's public tags. Fails, writing nothing, when too few relays
 * answered to be sure there is no event, or when the newest one can't be read.
 */
export async function updateAgentKeys(change: (keys: AgentKey[]) => AgentKey[]): Promise<PublishOutcome> {
  const account = activeAccount();
  if (!account) return { success: false, error: "Not logged in" };
  try {
    const relays = await outboxRelays(account.pubkey, PROFILE_RELAYS);
    const { newest: fetched, reach } = await requestNewestWithReach(
      relays,
      { kinds: [AGENT_KEYS_KIND], authors: [account.pubkey], limit: 1 },
      6000,
    );
    // The store can hold a newer copy than the relays that answered (one this session
    // just wrote, or one another relay served earlier): rewriting from an older read
    // would drop the keys it added.
    const held = eventStore.getReplaceable(AGENT_KEYS_KIND, account.pubkey) as NostrEvent | undefined;
    const newest = held && beats(held, fetched) ? held : fetched;
    let privateTags: string[][] = [];
    if (newest) {
      const read = await decryptAgentKeyTags(account, newest);
      if (!read) return { success: false, error: "Couldn't read the keys you saved before, so nothing was changed." };
      privateTags = read;
    } else if (reach.answered.length * 2 <= reach.asked.length) {
      return { success: false, error: "Too few of your relays answered to be sure. Nothing was changed; try again." };
    }

    const next = withAgentKeys(privateTags, change(parseAgentKeys(privateTags)));
    // Always the JSON, `[]` included: NIP-44 can't encrypt an empty string.
    const ciphertext = await encryptToSelf(account, JSON.stringify(next));
    if (!ciphertext) return { success: false, error: "Could not encrypt" };

    // NIP-FA needs no public tags; an `alt` an older version carried (NIP-31, unrecommended)
    // is dropped, anything else (NIP-70's `["-"]`) kept.
    const publicTags = newest?.tags.filter((t) => t[0] !== "alt") ?? [];
    const now = Math.floor(Date.now() / 1000);
    const signed = await signAs(account, {
      kind: AGENT_KEYS_KIND,
      tags: publicTags,
      content: ciphertext,
      // Past the copy we read, so relays keep this one even when this clock lags.
      created_at: newest ? Math.max(now, newest.created_at + 1) : now,
    });
    return await publishToRelays(signed);
  } catch (err) {
    return signingFailure(err, "Failed to sign");
  }
}

/**
 * Asks the provider for its model list with this key, from this page. A thrown
 * fetch is a host that is down, wrong, or that doesn't let web pages call it.
 */
export async function testAgentKey(entry: AgentKey, timeoutMs = 10_000): Promise<KeyTestResult> {
  const { url, headers, keyChecked } = modelsRequest(entry);
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null);
    return readTestAnswer(response.status, body, keyChecked);
  } catch {
    return { status: "unreachable" };
  }
}
