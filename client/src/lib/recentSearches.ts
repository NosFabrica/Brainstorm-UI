// Per-browser "recent searches" for the home search box. Stores only what the
// user typed into their own search box, first-party + functional → no consent
// banner (same lightweight localStorage pattern as brainstorm_seen_search_hints).
// Because it needs no backend, it's inherently a returning-visitor affordance:
// a first-time visitor has no recents, so the list simply doesn't render.
const KEY = "brainstorm_recent_searches";
const MAX = 6;

export interface RecentSearch {
  /** The exact query the user searched (name, handle, #topic, npub, …). */
  q: string;
  /** Epoch ms of the most recent time this query was searched. */
  t: number;
}

export function getRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is RecentSearch => !!e && typeof e.q === "string" && typeof e.t === "number")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

function write(list: RecentSearch[]): RecentSearch[] {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  return list;
}

// Record a committed search. De-dupes case-insensitively (keeping the newest
// entry's casing), moves it to the front, and caps the list. Returns the new
// list so callers can sync React state in one line.
export function pushRecentSearch(q: string): RecentSearch[] {
  const query = q.trim();
  if (!query) return getRecentSearches();
  const rest = getRecentSearches().filter((e) => e.q.toLowerCase() !== query.toLowerCase());
  return write([{ q: query, t: Date.now() }, ...rest].slice(0, MAX));
}

export function removeRecentSearch(q: string): RecentSearch[] {
  const query = q.trim().toLowerCase();
  return write(getRecentSearches().filter((e) => e.q.toLowerCase() !== query));
}

export function clearRecentSearches(): RecentSearch[] {
  return write([]);
}
