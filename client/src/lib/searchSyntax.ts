/**
 * The Filters panel's half of the search grammar: which tokens a control owns,
 * how it rewrites its own in place, and how it reads state back out of a query
 * somebody hand-edited.
 *
 * The GRAMMAR itself lives in `lib/searchQuery.ts` — a port of the relay's own
 * operator field, and the only place that decides what a token is. This module
 * is the panel's view of it, plus the two tokens only this client honours.
 *
 * Two classes of token, and the split matters to the box:
 *
 *  - **box tokens** — `from:` `to:` `#tag` `since:` `until:` `group:` `label:`
 *    and the NIP-73 scopes. These stay in the search box, drawn as pills by
 *    `SearchField`: they are what the search IS, and a person edits them.
 *  - **panel tokens** — `sort:` `include:spam` `filter:rank:gte:` and the
 *    client-only `trust:verified` / `reach:`. The panel owns these, and
 *    [splitFilters] hoists them out of the box into the URL's `f` — chrome
 *    nobody should have to read past (Benjamin, over the raw scope).
 *
 * `observer:` is in neither camp and belongs to the box: it is a debug token with no control
 * of its own, so it stays where it was typed rather than disappearing into the URL.
 *
 * Typing a panel token by hand still works, and still pills while it is being
 * typed: the panel picks it up on the next submit and the box comes back clean.
 */
import { nip19 } from "nostr-tools";
import {
  buildFilters, dayBound, parseQuery, tokenize, ymd,
  type ParsedQuery,
} from "@/lib/searchQuery";

export interface SearchFilterState {
  sort: string | null; // "recent" | "rank" | "rank:asc" | "followers" | "text" | null (best match)
  since: string | null; // YYYY-MM-DD
  until: string | null;
  /** NIP-50 `filter:rank:gte:N` — drop authors the observer ranks below N (0..100). */
  rankFloor: number | null;
  /** Client-side (the relay has no verification of its own). Token trust:verified. */
  verifiedOnly: boolean;
  /** Client-side (the relay has no hops). Token reach:follows | reach:friends. */
  reach: "follows" | "friends" | null;
  includeSpam: boolean;
  /**
   * NIP-50 `observer:` — whose web of trust ranks the page. No control writes this: it is a
   * debug token, typed by hand, and it draws as a pill in the box like the rest of the grammar.
   */
  rankAs: string | null; // 64-hex observer pubkey
}

export type SearchFilterPatch = Partial<SearchFilterState>;

/** token-name → does this raw token belong to that filter? */
const MATCHERS: Record<keyof SearchFilterState, (token: string) => boolean> = {
  sort: (t) => /^sort:/i.test(t),
  since: (t) => /^since:/i.test(t),
  until: (t) => /^until:/i.test(t),
  rankFloor: (t) => /^filter:rank:/i.test(t),
  verifiedOnly: (t) => /^trust:verified$/i.test(t),
  reach: (t) => /^reach:(follows|friends)$/i.test(t),
  includeSpam: (t) => /^include:spam$/i.test(t),
  rankAs: (t) => /^observer:/i.test(t),
};

/**
 * The tokens the PANEL owns, which [splitFilters] keeps out of the box.
 *
 * Two are deliberately not here. `since:`/`until:` draw as pills with a calendar under them, so
 * they belong to the box even though the panel's Time control also writes them. `observer:` has
 * no control at all — it is a debug token somebody types, so it has to stay where they typed it
 * or it would vanish into the URL with nothing on the page to show it.
 */
const PANEL_KEYS = ["sort", "rankFloor", "verifiedOnly", "reach", "includeSpam"] as const;

function tokenFor(key: keyof SearchFilterState, value: unknown): string | null {
  switch (key) {
    case "sort":
      return value ? `sort:${value}` : null;
    case "since":
      return value ? `since:${value}` : null;
    case "until":
      return value ? `until:${value}` : null;
    case "rankFloor":
      return value == null ? null : `filter:rank:gte:${value}`;
    case "verifiedOnly":
      return value ? "trust:verified" : null;
    case "reach":
      return value ? `reach:${value}` : null;
    case "includeSpam":
      return value ? "include:spam" : null;
    case "rankAs":
      return value ? `observer:${value}` : null;
  }
}

const isPanelToken = (t: string) => PANEL_KEYS.some((k) => MATCHERS[k](t));

/**
 * The box's text apart from the panel's tokens. The box shows the search — words, people,
 * days, topics; the panel's chrome rides beside it (state + URL) rather than as text a person
 * has to read past.
 */
export function splitFilters(query: string): { text: string; tokens: string } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  return {
    text: tokens.filter((t) => !isPanelToken(t)).join(" "),
    tokens: tokens.filter(isPanelToken).join(" "),
  };
}

/**
 * The free-text words in a query, with every token of either class lifted out — "did this
 * person search for anything, or are they browsing?". A box holding `#nostr sort:recent` has
 * no words; one holding `gm` has.
 */
export const queryWords = (query: string): string => parseQuery(query).words;

/**
 * How many filters a person has switched on — the badge on the Filters button. A date range
 * counts once, however many ends it has. `rankAs` is not counted: the panel has no control for
 * it, so a badge that included it would send somebody looking for something that is not there.
 */
export function activeFilterCount(state: SearchFilterState): number {
  let n = 0;
  if (state.sort) n++;
  if (state.since || state.until) n++;
  if (state.rankFloor != null) n++;
  if (state.verifiedOnly) n++;
  if (state.reach) n++;
  if (state.includeSpam) n++;
  return n;
}

/** Google's Tools menu: Any time · Past 24 hours · Past week · Past month · Past year · Custom. */
export type DatePreset = "any" | "day" | "week" | "month" | "year" | "custom";

/** The since: day a preset means, from `now` (local days). Null for "any". */
export function sinceForPreset(preset: DatePreset, now: Date = new Date()): string | null {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "day":
      d.setDate(d.getDate() - 1);
      return ymd(d);
    case "week":
      d.setDate(d.getDate() - 7);
      return ymd(d);
    case "month":
      d.setMonth(d.getMonth() - 1);
      return ymd(d);
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      return ymd(d);
    default:
      return null;
  }
}

/** Which preset a since/until pair is — "custom" for anything the menu can't say. */
export function datePreset(state: { since: string | null; until: string | null }, now: Date = new Date()): DatePreset {
  if (!state.since && !state.until) return "any";
  if (state.until) return "custom";
  for (const p of ["day", "week", "month", "year"] as const) {
    if (sinceForPreset(p, now) === state.since) return p;
  }
  return "custom";
}

/**
 * Rewrite the query so the given filters hold: each mentioned filter's old token is removed,
 * its new token (if any) appended. Unmentioned tokens — including from:/#tag/quoted text —
 * pass through untouched.
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

/**
 * What the wire actually gets. `from:`/`to:`/`#tag`/`since:`/`until:`/`group:`/`label:`/the
 * NIP-73 scopes are NOT relay extensions — they become plain NIP-01 filter fields and the relay
 * never sees the prefixes (sending them through matches NOTHING against the text index). Only
 * `sort:`/`observer:`/`include:spam`/`filter:rank:` ride the search string.
 *
 * A flat view of [parseQuery], kept because the shape is what several callers want; the union
 * of filters a `#tag`, a `group:`, a `label:` or a scope needs is [searchFilters]'s job.
 */
export interface LiftedQuery {
  search: string;
  authors?: string[];
  "#p"?: string[];
  "#t"?: string[];
  since?: number;
  until?: number;
  /** `kind:N` tokens, and `spec:` as the word for kind 30817 — typed by agents
   *  and power users; no chip exposes them. */
  kinds?: number[];
}

export function liftQuery(query: string): LiftedQuery {
  const q = parseQuery(query);
  return {
    search: q.terms,
    ...(q.authors.length ? { authors: q.authors } : {}),
    ...(q.mentions.length ? { "#p": q.mentions } : {}),
    ...(q.hashtags.length ? { "#t": q.hashtags } : {}),
    ...(q.kinds.length ? { kinds: q.kinds } : {}),
    ...(q.since != null ? { since: q.since } : {}),
    ...(q.until != null ? { until: q.until } : {}),
  };
}

/** The whole parse, for callers that need more than the flat view. */
export const parseSearch = (query: string): ParsedQuery => parseQuery(query);

/** The REQ a query becomes — re-exported so `services/search.ts` has one import for the grammar. */
export { buildFilters as searchFilters } from "@/lib/searchQuery";

export interface PersonAssist {
  prefix: "from" | "to";
  /** The name fragment being typed after the colon. */
  fragment: string;
  /** The query with the fragment completed to a picked key. */
  complete: (key: string) => string;
}

/**
 * The from:/to: people-picker trigger: when the LAST token is a name fragment mid-type
 * ("from:ja"), the box offers profiles and writes the key — nobody types an npub by hand.
 * Quiet once a key is already in place.
 */
export function personAssist(query: string): PersonAssist | null {
  const match = query.match(/(^|\s)(from|to):(\S+)$/i);
  if (!match) return null;
  const prefix = match[2].toLowerCase() as "from" | "to";
  const fragment = match[3];
  if (/^npub1/i.test(fragment) || /^[0-9a-f]{64}$/i.test(fragment)) return null;
  const head = query.slice(0, query.length - fragment.length);
  return {
    prefix,
    fragment,
    complete: (key: string) => `${head}${key}`,
  };
}

/** The panel's state, read back out of the query. */
export function readFilters(query: string): SearchFilterState {
  const q = parseQuery(query);
  // The days come from the TOKENS, not the parsed seconds: the panel's date inputs speak
  // `YYYY-MM-DD`, and a round trip through an epoch would move a day across a timezone.
  //
  // Which token, though, is [parseQuery]'s rule and not "the last one wins": two of one
  // prefix keep the NARROWER bound, so `since:2026-03-01 since:2026-01-01` is asked as March
  // and the panel has to say March. Reading the last would have shown a day the search was
  // not using — and then rewritten the query from it.
  let since: string | null = null;
  let until: string | null = null;
  for (const seg of tokenize(query)) {
    if (seg.type !== "date") continue;
    if (seg.field === "since") { if (since == null || seg.day > since) since = seg.day; }
    else if (until == null || seg.day < until) until = seg.day;
  }
  return {
    sort: q.sort,
    since,
    until,
    rankFloor: q.rankFloor,
    verifiedOnly: q.verifiedOnly,
    reach: q.reach,
    includeSpam: q.includeSpam,
    rankAs: q.observer,
  };
}

/** Sorts the relay cannot run over a wordless browse — it never answers, and a hung request
 *  stalls every other request on the same connection (probed 2026-09-05). Offered again the
 *  moment there are words. */
export const BROWSE_UNAVAILABLE_SORTS: ReadonlySet<string> = new Set(["rank", "followers"]);

/**
 * The query the relay can actually answer. A browse (no words) asking for a rank or follower
 * sort falls back to newest first; anything with words is left exactly as asked.
 */
export function browseSafeQuery(query: string): string {
  if (queryWords(query)) return query;
  const state = readFilters(query);
  if (state.sort && BROWSE_UNAVAILABLE_SORTS.has(state.sort)) return applyFilters(query, { sort: "recent" });
  return query;
}

/**
 * A person scope: a query that is exactly one `from:` key and nothing else — "everything this
 * person published", to be narrowed by the tab. The public profile's "View all" hands the
 * search this, not a name: words pull in strangers who share them (Benjamin, over "joe martin"
 * on Articles). The hex pubkey, or null for any other query.
 */
export function personScope(query: string): string | null {
  const q = parseQuery(query);
  if (q.words.trim() !== "") return null;
  if (q.hashtags.length || q.mentions.length || q.cites.length || q.addrs.length) return null;
  if (q.labels.length || q.scopes.length || q.groups.length) return null;
  if (q.since != null || q.until != null) return null;
  return q.authors.length === 1 ? q.authors[0] : null;
}

/** The search page, scoped to one person, on one vertical. */
export function scopedSearchHref(pubkey: string, tab: string): string {
  let key = pubkey;
  try {
    key = nip19.npubEncode(pubkey);
  } catch {
    // a malformed key stays as typed — the box will show the failure
  }
  return `/?q=${encodeURIComponent(`from:${key}`)}&t=${encodeURIComponent(tab)}`;
}

/**
 * The one `from:` key in a query and the words beside it. Null when there is no key, two keys,
 * or a to:. The box draws it as a person chip either way — this is what tells the RESULTS that
 * the whole page is one person's work.
 */
export function scopeOf(query: string): { pubkey: string; token: string; rest: string } | null {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const keys = tokens.filter((t) => /^(from|to):\S+$/i.test(t));
  if (keys.length !== 1 || !/^from:/i.test(keys[0])) return null;
  const parsed = parseQuery(keys[0]);
  const pubkey = parsed.authors[0];
  if (!pubkey) return null;
  return { pubkey, token: keys[0], rest: tokens.filter((t) => t !== keys[0]).join(" ") };
}

/** What a content tab's things are called, for the scoped box's placeholder. */
const TAB_THINGS: Record<string, string> = {
  notes: "notes",
  articles: "articles",
  media: "media",
  music: "music",
  live: "live streams",
  events: "events",
  apps: "apps",
  repos: "repos",
  issues: "issues",
  prs: "pull requests",
  lists: "lists",
  shop: "shop",
};

/**
 * The empty scoped box says what typing will do ON THIS TAB, with the person's name — "Search
 * everything from means", "Search means's notes". Until the name arrives it says "Search their
 * posts": true, never blank.
 */
export function scopedPlaceholder(tab: string, name: string | null): string {
  if (!name) return "Search their posts";
  const thing = TAB_THINGS[tab];
  return thing ? `Search ${name}'s ${thing}` : `Search everything from ${name}`;
}

/** The typeahead's footer row under a scope — the person, never the raw key. */
export function seeAllLabel(words: string, name: string | null): string {
  const who = name || "them";
  const w = words.trim();
  return w ? `See all results for "${w}" from ${who}` : `See everything from ${who}`;
}

/** Re-exported so callers that only touch the panel need one import. */
export { dayBound, ymd };
