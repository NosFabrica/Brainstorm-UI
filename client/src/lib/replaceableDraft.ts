/**
 * Editing a replaceable list without losing a version you never saw.
 *
 * A replaceable (or addressable) event is overwritten whole: the newest copy
 * wins (NIP-01), so every edit is a read-modify-write of the entire list. Three
 * ways that has lost people's data here, each closed by `useReplaceableListDraft`:
 *
 *  - an edit made before the list was read: "Add" while the list was still
 *    loading built the draft from nothing, and Publish replaced the real list;
 *  - "couldn't read it" taken for "there is none": a relay timeout and "no such
 *    list" both come back empty, unless the read counts who answered;
 *  - a draft made from one version published over a newer one that arrived
 *    while it was open, reverting it.
 *
 * This module is the I/O and the rules; the hook (hooks/useReplaceableListDraft)
 * holds the draft.
 */
import type { NostrEvent } from "nostr-tools";
import { eventStore } from "@/lib/eventStore";
import { PROFILE_RELAYS } from "@/lib/relays";
import { beats, requestNewestWithReach } from "@/lib/relayRequest";
import { outboxRelays } from "@/lib/relayRouting";

/** Where a list stands before anyone may edit it. */
export type ListReadStatus =
  /** Being read. */
  | "loading"
  /** Too few relays answered to tell "there is none" from "couldn't read it". */
  | "unreadable"
  /** Read: its newest version is known, or a majority of relays said there is none. */
  | "ready";

/** Said when a publish stops because the list changed under the draft. */
export const NEWER_VERSION_ARRIVED =
  "A newer version arrived while you were editing. Load it, then make your change again: nothing was published.";

/** Said when a publish is attempted before the list has been read. */
export const LIST_NOT_READ = "Your current list hasn't loaded yet, so publishing now could replace it. Try again.";

export interface ReplaceableProbe {
  /** The newest version: from the relays, or the store's copy when that is newer (or nobody answered). */
  event: NostrEvent | undefined;
  /** No version anywhere, and a majority of the relays asked said so. */
  provenAbsent: boolean;
}

const dOf = (event: NostrEvent) => event.tags.find((t) => t[0] === "d")?.[1] ?? "";

/** `event` is a version of this list: its kind, signed by its author, at its `d`. */
export function isVersionOf(event: NostrEvent | null | undefined, kind: number, pubkey: string, d?: string) {
  return !!event && event.kind === kind && event.pubkey === pubkey && (d === undefined || dOf(event) === d);
}

/** The newest of these that is a version of the list (NIP-01: newer wins, then the lower id). */
export function newestVersion(
  candidates: readonly (NostrEvent | null | undefined)[],
  kind: number,
  pubkey: string,
  d?: string,
): NostrEvent | null {
  let best: NostrEvent | undefined;
  for (const c of candidates) if (isVersionOf(c, kind, pubkey, d) && beats(c!, best)) best = c!;
  return best ?? null;
}

/** Seconds: now, or just past `latest`, so relays keep the edit over it even within the same second. */
export function createdAtPast(latest: { created_at: number } | null | undefined, nowMs = Date.now()): number {
  return Math.max(Math.floor(nowMs / 1000), (latest?.created_at ?? 0) + 1);
}

/**
 * The newest version of a replaceable list, read so that "there is none" can be
 * told from "nobody answered" (lib/relayRequest `requestNewestWithReach`).
 * `relays` defaults to the author's write relays, where their lists live.
 *
 * The store's copy counts: it wins when it is newer (our own publish, relays
 * not caught up) and answers when no relay does. A version signed by anyone
 * else, or at another `d`, is no version of this list, and proves nothing.
 */
export async function probeReplaceable(
  kind: number,
  pubkey: string,
  d?: string,
  { relays, timeoutMs = 6000 }: { relays?: string[]; timeoutMs?: number } = {},
): Promise<ReplaceableProbe> {
  const held = () => (eventStore.getReplaceable(kind, pubkey, d) as NostrEvent | undefined) ?? undefined;
  try {
    const where = relays ?? (await outboxRelays(pubkey, PROFILE_RELAYS));
    const filter = { kinds: [kind], authors: [pubkey], ...(d !== undefined ? { "#d": [d] } : {}), limit: 5 };
    const { newest, reach } = await requestNewestWithReach(where, filter, timeoutMs);
    const event = newestVersion([newest, held()], kind, pubkey, d) ?? undefined;
    return { event, provenAbsent: !event && !newest && reach.answered.length * 2 > reach.asked.length };
  } catch {
    return { event: held(), provenAbsent: false };
  }
}
