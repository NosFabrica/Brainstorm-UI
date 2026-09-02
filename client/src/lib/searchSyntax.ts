/**
 * The UI-side sliver of the SearchOverTrust relay's query grammar.
 *
 * The RELAY owns the semantics — every token below reaches it as typed
 * (services/search passes the text through verbatim). This module exists so
 * the Filters panel can rewrite its own tokens in place and read state back
 * out of a query the user hand-edited, with the tokens kept VISIBLE in the
 * box — users learn the grammar by watching the panel write it.
 */

export interface SearchFilterState {
  sort: string | null; // "recent" | "rank" | "followers" | "text" | null (best match)
  since: string | null; // YYYY-MM-DD
  until: string | null;
  minRank: number | null; // 0..100 → filter:rank:gte:N
  includeSpam: boolean;
  rankAs: string | null; // 64-hex observer pubkey
}

export type SearchFilterPatch = Partial<SearchFilterState>;

/** token-name → does this raw token belong to that filter? */
const MATCHERS: Record<keyof SearchFilterState, (token: string) => boolean> = {
  sort: (t) => /^sort:/i.test(t),
  since: (t) => /^since:/i.test(t),
  until: (t) => /^until:/i.test(t),
  minRank: (t) => /^filter:rank:/i.test(t),
  includeSpam: (t) => /^include:spam$/i.test(t),
  rankAs: (t) => /^observer:/i.test(t),
};

function tokenFor(key: keyof SearchFilterState, value: unknown): string | null {
  switch (key) {
    case "sort":
      return value ? `sort:${value}` : null;
    case "since":
      return value ? `since:${value}` : null;
    case "until":
      return value ? `until:${value}` : null;
    case "minRank":
      return value != null ? `filter:rank:gte:${value}` : null;
    case "includeSpam":
      return value ? "include:spam" : null;
    case "rankAs":
      return value ? `observer:${value}` : null;
  }
}

/**
 * Rewrite the query so the given filters hold: each mentioned filter's old
 * token is removed, its new token (if any) appended. Unmentioned tokens —
 * including from:/#tag/quoted text — pass through untouched.
 */
export function applyFilters(query: string, patch: SearchFilterPatch): string {
  const keys = Object.keys(patch) as (keyof SearchFilterState)[];
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !keys.some((k) => MATCHERS[k](t)));
  const appended = keys
    .map((k) => tokenFor(k, patch[k]))
    .filter((t): t is string => t !== null);
  return [...kept, ...appended].join(" ");
}

/** The panel's state, read back out of the query. */
export function readFilters(query: string): SearchFilterState {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const find = (k: keyof SearchFilterState) => tokens.find((t) => MATCHERS[k](t));
  const sortTok = find("sort");
  const sinceTok = find("since");
  const untilTok = find("until");
  const rankTok = find("minRank");
  const observerTok = find("rankAs");
  const minRank = rankTok ? Number(rankTok.split(":").pop()) : NaN;
  return {
    sort: sortTok ? sortTok.slice(5) : null,
    since: sinceTok ? sinceTok.slice(6) : null,
    until: untilTok ? untilTok.slice(6) : null,
    minRank: Number.isFinite(minRank) ? minRank : null,
    includeSpam: !!find("includeSpam"),
    rankAs: observerTok ? observerTok.slice(9) : null,
  };
}
