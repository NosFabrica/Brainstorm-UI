/**
 * Persisted authoritative snapshot of the user's contact list (kind-3), so the
 * follow handlers always have a confirmed base + a known follow count to guard
 * against accidental wipes. kind-3 is replaceable (newest-by-created_at wins on
 * every relay), so publishing a list shorter than the user actually has wipes
 * their follows. This store gives us a monotonic floor: an observed relay read
 * can only *grow* the known count, never shrink it; our own guarded publishes
 * set it authoritatively.
 */

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

const storageKey = (pubkey: string) => `brainstorm_known_follows:${pubkey}`;

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
 * overwrites; an observed relay read is only stored when it doesn't shrink the
 * known floor (so a stale/short relay response can never lower our guard).
 */
export function recordFollowList(
  pubkey: string,
  event: FollowEventLike,
  opts: { authoritative?: boolean } = {},
): void {
  if (!pubkey || !event?.tags) return;
  try {
    const newCount = countFollows(event.tags);
    const existing = loadKnownFollowList(pubkey);
    if (!opts.authoritative && existing && newCount < existing.count) return;
    localStorage.setItem(
      storageKey(pubkey),
      JSON.stringify({ event, count: newCount, updated_at: Date.now() } as StoredFollowList),
    );
  } catch {
    /* ignore */
  }
}
