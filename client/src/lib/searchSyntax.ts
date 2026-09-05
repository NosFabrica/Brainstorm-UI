/**
 * The UI-side sliver of the SearchOverTrust relay's query grammar.
 *
 * The RELAY owns the semantics — every token below reaches it as typed
 * (services/search passes the text through verbatim). This module exists so
 * the Filters panel can rewrite its own tokens in place and read state back
 * out of a query the user hand-edited, with the tokens kept VISIBLE in the
 * box — users learn the grammar by watching the panel write it.
 */
import { nip19 } from "nostr-tools";

export interface SearchFilterState {
  sort: string | null; // "recent" | "rank" | "followers" | null (best match)
  since: string | null; // YYYY-MM-DD
  until: string | null;
  /** Client-side (probed: the relay ignores filter:rank). Token trust:verified. */
  verifiedOnly: boolean;
  /** Client-side (the relay has no hops). Token reach:follows | reach:friends. */
  reach: "follows" | "friends" | null;
  includeSpam: boolean;
  rankAs: string | null; // 64-hex observer pubkey
}

export type SearchFilterPatch = Partial<SearchFilterState>;

/** token-name → does this raw token belong to that filter? */
const MATCHERS: Record<keyof SearchFilterState, (token: string) => boolean> = {
  sort: (t) => /^sort:/i.test(t),
  since: (t) => /^since:/i.test(t),
  until: (t) => /^until:/i.test(t),
  verifiedOnly: (t) => /^trust:verified$/i.test(t),
  reach: (t) => /^reach:(follows|friends)$/i.test(t),
  includeSpam: (t) => /^include:spam$/i.test(t),
  rankAs: (t) => /^observer:/i.test(t),
};

/** Tokens the CLIENT honours; the relay never sees them (as text they'd match nothing). */
const CLIENT_ONLY = (t: string) => MATCHERS.verifiedOnly(t) || MATCHERS.reach(t);

function tokenFor(key: keyof SearchFilterState, value: unknown): string | null {
  switch (key) {
    case "sort":
      return value ? `sort:${value}` : null;
    case "since":
      return value ? `since:${value}` : null;
    case "until":
      return value ? `until:${value}` : null;
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

const isFilterToken = (t: string) => (Object.keys(MATCHERS) as (keyof SearchFilterState)[]).some((k) => MATCHERS[k](t));

/**
 * The words apart from the filters. The box shows the words; the filters
 * ride beside them (state + URL) — never as text a person has to read past.
 */
export function splitFilters(query: string): { text: string; tokens: string } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  return {
    text: tokens.filter((t) => !isFilterToken(t)).join(" "),
    tokens: tokens.filter(isFilterToken).join(" "),
  };
}

/** How many filters are switched on — the badge on the Filters button. A date
 *  range counts once, however many ends it has. */
export function activeFilterCount(state: SearchFilterState): number {
  let n = 0;
  if (state.sort) n++;
  if (state.since || state.until) n++;
  if (state.verifiedOnly) n++;
  if (state.reach) n++;
  if (state.includeSpam) n++;
  if (state.rankAs) n++;
  return n;
}

/** Google's Tools menu: Any time · Past 24 hours · Past week · Past month · Past year · Custom. */
export type DatePreset = "any" | "day" | "week" | "month" | "year" | "custom";

function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The since: day a preset means, from `now` (local days). Null for "any". */
export function sinceForPreset(preset: DatePreset, now: Date = new Date()): string | null {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "day":
      d.setDate(d.getDate() - 1);
      return ymdLocal(d);
    case "week":
      d.setDate(d.getDate() - 7);
      return ymdLocal(d);
    case "month":
      d.setMonth(d.getMonth() - 1);
      return ymdLocal(d);
    case "year":
      d.setFullYear(d.getFullYear() - 1);
      return ymdLocal(d);
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

/**
 * What the wire actually gets. Discovered by probing the staging relay:
 * from:/to:/#tag/since:/until: are NOT relay extensions — the reference page
 * lifts them into plain NIP-01 filter fields and the relay never sees the
 * prefixes (sending them through matches NOTHING against the text index).
 * Only sort:/observer:/include:spam/filter:rank: ride the search string.
 */
export interface LiftedQuery {
  search: string;
  authors?: string[];
  "#p"?: string[];
  "#t"?: string[];
  since?: number;
  until?: number;
}

function keyToHex(raw: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase();
  if (/^npub1[02-9ac-hj-np-z]+$/i.test(raw)) {
    try {
      const decoded = nip19.decode(raw.toLowerCase());
      if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
    } catch {
      /* fall through */
    }
  }
  return null;
}

/** Local-day epoch: since = 00:00:00, until = 23:59:59 (NIP-01 until is
 *  inclusive — stopping at midnight would exclude the whole named day). */
function dayEpoch(ymd: string, field: "since" | "until"): number | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at =
    field === "since" ? new Date(y, mo - 1, d, 0, 0, 0) : new Date(y, mo - 1, d, 23, 59, 59);
  if (Number.isNaN(at.getTime())) return null;
  return Math.floor(at.getTime() / 1000);
}

export function liftQuery(query: string): LiftedQuery {
  const out: LiftedQuery = { search: "" };
  const rest: string[] = [];
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    // Client-honoured tokens stay off the wire.
    if (CLIENT_ONLY(token)) continue;
    const person = token.match(/^(from|to):(\S+)$/i);
    if (person) {
      const hex = keyToHex(person[2]);
      if (hex) {
        const field = person[1].toLowerCase() === "from" ? "authors" : "#p";
        (out[field] ??= []).push(hex);
        continue;
      }
      // An unresolvable key stays as text — visible failure beats a filter
      // nobody asked for.
      rest.push(token);
      continue;
    }
    const day = token.match(/^(since|until):(\d{4}-\d{2}-\d{2})$/i);
    if (day) {
      const field = day[1].toLowerCase() as "since" | "until";
      const at = dayEpoch(day[2], field);
      if (at !== null) {
        out[field] = at;
        continue;
      }
      rest.push(token);
      continue;
    }
    if (/^#[\w-]+$/.test(token)) {
      (out["#t"] ??= []).push(token.slice(1).toLowerCase());
      continue;
    }
    rest.push(token);
  }
  out.search = rest.join(" ");
  return out;
}

export interface PersonAssist {
  prefix: "from" | "to";
  /** The name fragment being typed after the colon. */
  fragment: string;
  /** The query with the fragment completed to a picked key. */
  complete: (key: string) => string;
}

/**
 * The from:/to: people-picker trigger: when the LAST token is a name
 * fragment mid-type ("from:ja"), the box offers profiles and writes the key —
 * nobody types an npub by hand. Quiet once a key is already in place.
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
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const find = (k: keyof SearchFilterState) => tokens.find((t) => MATCHERS[k](t));
  const sortTok = find("sort");
  const sinceTok = find("since");
  const untilTok = find("until");
  const reachTok = find("reach");
  const observerTok = find("rankAs");
  return {
    sort: sortTok ? sortTok.slice(5) : null,
    since: sinceTok ? sinceTok.slice(6) : null,
    until: untilTok ? untilTok.slice(6) : null,
    verifiedOnly: !!find("verifiedOnly"),
    reach: reachTok ? (reachTok.slice(6).toLowerCase() as "follows" | "friends") : null,
    includeSpam: !!find("includeSpam"),
    rankAs: observerTok ? observerTok.slice(9) : null,
  };
}

/** Sorts the relay cannot run over a wordless browse — it never answers, and a
 *  hung request stalls every other request on the same connection (probed
 *  2026-09-05). Offered again the moment there are words. */
export const BROWSE_UNAVAILABLE_SORTS: ReadonlySet<string> = new Set(["rank", "followers"]);

/**
 * The query the relay can actually answer. A browse (no words) asking for a
 * rank or follower sort falls back to newest first; anything with words is
 * left exactly as asked.
 */
export function browseSafeQuery(query: string): string {
  const { text } = splitFilters(query);
  if (text) return query;
  const state = readFilters(query);
  if (state.sort && BROWSE_UNAVAILABLE_SORTS.has(state.sort)) return applyFilters(query, { sort: "recent" });
  return query;
}
