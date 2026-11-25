/**
 * Persisted snapshot of the user's contact list (kind-3), so the follow
 * handlers always have a confirmed base + a known follow count to guard
 * against accidental wipes: with a snapshot on hand, "couldn't read the
 * relays" never becomes "publish a list from scratch".
 *
 * kind-3 is replaceable, and the newest wins (NIP-01) — so the snapshot is the
 * newest copy signed by this key that this device has seen. It only moves
 * forward in time: an observed relay read replaces it only when newer, never
 * because it is longer (an older, longer copy is a list the user has since
 * edited elsewhere). Our own publishes replace it outright.
 */
import { accountKey } from "@/lib/accountStorage";
import { beats } from "@/lib/relayRequest";

export interface FollowEventLike {
  pubkey: string;
  kind: number;
  tags: string[][];
  content: string;
  created_at: number;
  id?: string;
  sig?: string;
}

interface StoredFollowList {
  event: FollowEventLike;
  count: number;
  updated_at: number;
}

const storageKey = (pubkey: string) => accountKey("brainstorm_known_follows", pubkey);

export function countFollows(tags: string[][]): number {
  let n = 0;
  for (const t of tags) if (t[0] === "p" && t[1]) n++;
  return n;
}

export function loadKnownFollowList(pubkey: string): StoredFollowList | null {
  if (!pubkey) return null;
  try {
    const raw = localStorage.getItem(storageKey(pubkey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFollowList;
    if (!parsed?.event?.tags) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function knownFollowCount(pubkey: string): number {
  return loadKnownFollowList(pubkey)?.count ?? 0;
}

/**
 * Record a contact-list snapshot. `authoritative` (our own guarded publish) always
 * overwrites; an observed relay read is only stored when it is newer than the
 * snapshot (so a stale relay response can never move it back). A list signed
 * by any other key is never stored.
 */
export function recordFollowList(pubkey: string, event: FollowEventLike, opts: { authoritative?: boolean } = {}): void {
  if (!pubkey || !event?.tags) return;
  if (event.pubkey !== pubkey || event.kind !== 3) return;
  try {
    const newCount = countFollows(event.tags);
    const existing = loadKnownFollowList(pubkey);
    if (!opts.authoritative && existing && !beats(event as never, existing.event as never)) return;
    localStorage.setItem(
      storageKey(pubkey),
      JSON.stringify({ event, count: newCount, updated_at: Date.now() } as StoredFollowList),
    );
  } catch {
    /* ignore */
  }
}
