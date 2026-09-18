/**
 * The search box's own small language, parsed in one place.
 *
 * Ported from the SearchOverTrust relay's own operator UI
 * (`web/shared/query.js` in NosFabrica/vespa-relay), which is the reference
 * implementation of this grammar — the two must agree, or a query written
 * here means something else there. The port keeps its token boundaries and
 * its canonical-spelling expansions verbatim; what it adds is the four
 * ranking tokens the relay's field leaves as bare text (`sort:`,
 * `observer:`, `include:spam`, `filter:rank:gte:`) and the two tokens only
 * this client honours (`trust:verified`, `reach:`), so a hand-typed one is
 * understood and drawn rather than silently passed through.
 *
 * Two kinds of token come out of here:
 *
 *  - **lifted** — `from:` `to:` `since:` `until:` `#tag` `group:` `label:`
 *    and the NIP-73 scopes become NIP-01 filter FIELDS. The relay never sees
 *    the prefixes (probed: sending them as text matches nothing).
 *  - **ranking** — `sort:` `observer:` `include:spam` `filter:rank:` ride the
 *    NIP-50 `search` string as typed; they are the relay's own extensions.
 *
 * `lib/searchSyntax.ts` sits on top of this and owns the Filters panel's
 * read/write of the ranking tokens; `services/search.ts` turns [buildFilters]
 * into the REQ.
 */
import { nip19, type Filter } from "nostr-tools";

// An npub is a fixed 63 characters, so the token boundary is known before decoding.
const NPUB = "npub1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}";

// The other things `to:` can name: an event, and an addressable event's coordinate. Their
// payloads vary in length, so the boundary is where the bech32 alphabet stops.
const POINTER = "(?:note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+";

// Only the ISO spelling: `06/08/2026` is a different day to half the world.
const YMD = "\\d{4}-\\d{2}-\\d{2}";

// The NIP-73 scope prefixes, longest `podcast:` form first so a shorter one cannot half-match.
const SCOPES = "podcast:item:guid|podcast:publisher|podcast:guid|site|isbn|geo|isan|doi";

// A scope's value: everything to the next whitespace, minus trailing sentence punctuation.
// Only `. , ; ! ?`, since DOIs and urls contain nearly anything else.
const SCOPE_VALUE = "\\S*[^\\s.,;!?]";

// A group id is whatever its host relay minted, so it is delimited like a scope's value.
const GROUP_ID = SCOPE_VALUE;

// A NIP-32 mark is an opaque string from its namespace (`review/app`, `en`), delimited the same way.
const LABEL_VALUE = SCOPE_VALUE;

/** Can this id be written as a `group:` token that reads back as itself? */
const GROUP_ONLY = new RegExp(`^${GROUP_ID}$`);
export const groupTokenizes = (id: string): boolean => GROUP_ONLY.test(String(id ?? ""));

/** The same question for a mark a `label:` token would carry: a value with a space is no token. */
const LABEL_ONLY = new RegExp(`^${LABEL_VALUE}$`);
export const labelTokenizes = (mark: string): boolean => LABEL_ONLY.test(String(mark ?? ""));

/**
 * Every token in one scan, because they interleave and the field measures its caret against
 * their order. The lead group anchors a token to a word start so a `to:` inside a url is not
 * a filter; a date ends on anything but a word character or a hyphen.
 *
 * Order matters twice over: `filter:rank:` before the bare `sort`-style keys so its colons
 * cannot be half-eaten, and the scope alternation before `label:`/`group:` for the same reason.
 */
const TOKEN = new RegExp(
  `(?<lead>^|\\s)(?:` +
    `(?<who>(?:from|to):)?(?<key>${NPUB})(?![a-z0-9])` +
    `|(?<whohex>(?:from|to):)(?<keyhex>[0-9a-f]{64})(?![0-9a-z])` +
    `|to:(?<ptr>${POINTER})(?![a-z0-9])` +
    `|(?<when>(?:since|until):)(?<day>${YMD})(?![\\w-])` +
    `|filter:rank:gte:(?<floor>\\d{1,3})(?![\\w-])` +
    `|(?<lens>include:spam)(?![\\w:-])` +
    `|observer:(?<obs>[0-9a-fA-F]{64}|${NPUB})(?![a-z0-9])` +
    `|sort:(?<order>[a-z]+(?::[a-z]+)?)(?![\\w-])` +
    `|(?<trust>trust:verified)(?![\\w:-])` +
    `|reach:(?<hops>follows|friends)(?![\\w:-])` +
    `|(?<ext>(?:${SCOPES}):)(?<sid>${SCOPE_VALUE})` +
    `|(?<lbl>label:)(?<lid>${LABEL_VALUE})` +
    `|(?<grp>group:)(?<gid>${GROUP_ID})` +
    `)`,
  "gi",
);

// The prefixes while they are still being typed: everything after the colon up to the caret. A
// `to:` at a NIP-19 pointer names no person, so the people picker stands down for it.
const PARTIAL = /(^|\s)(from|to):((?!(?:note|nevent|naddr)1)\S*)$/i;
const PARTIAL_DAY = /(^|\s)(since|until):(\S*)$/i;
const PARTIAL_GROUP = /(^|\s)(group):(\S*)$/i;

// A hashtag: a `#` that starts a word, then letters, marks and digits by unicode property, the
// hyphen, and emoji with ZWJ and the variation selector so a family emoji is not cut short.
const WORD = "\\p{L}\\p{M}\\p{N}_";
const EMOJI = "\\p{Extended_Pictographic}\\u200D\\uFE0F";
const HASHTAG = new RegExp(`(^|[^${WORD}])#([${WORD}${EMOJI}-]+)`, "gu");

// The punctuation a lifted hashtag strands (`#bitcoin.` leaves `.`). `#`, `"` and `-` are not
// orphans: they are NIP-50's own operators.
const ORPHAN = new RegExp(`(^|\\s)[^${WORD}${EMOJI}#"-]+(?=\\s|$)`, "gu");

/** The leftover words, with the punctuation a lifted token stranded removed. */
const tidyTerms = (s: string): string => s.replace(ORPHAN, "$1").replace(/\s+/g, " ").trim();

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** A Date as the `YYYY-MM-DD` this language writes, in the reader's timezone. */
export const ymd = (d: Date): string =>
  `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * `YYYY-MM-DD` as the unix second that bound means, or null if it is not a day: `since` is
 * 00:00:00 and `until` 23:59:59 of that day in the reader's timezone, since NIP-01's `until` is
 * inclusive. The round-trip check rejects `2026-02-31`, which the Date constructor would roll over.
 */
export function dayBound(day: string, field: "since" | "until" | string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ""));
  if (!m) return null;
  const [y, mo, d] = m.slice(1).map(Number);
  const at = new Date(y, mo - 1, d);
  if (at.getFullYear() !== y || at.getMonth() !== mo - 1 || at.getDate() !== d) return null;
  if (field !== "until") return Math.floor(at.getTime() / 1000);
  // The second before the next midnight, not midnight plus 86,399: a local day can be 23 or 25 hours.
  return Math.floor(new Date(y, mo - 1, d + 1).getTime() / 1000) - 1;
}

/**
 * Every spelling of `tag` worth asking a tag filter for, best first: as typed, lowercase,
 * Capitalized, UPPERCASE, deduped. The store matches tag values cased.
 */
export function tagValues(tag: string): string[] {
  const t = String(tag ?? "");
  if (!t) return [];
  const lower = t.toLowerCase();
  return [...new Set([t, lower, lower.charAt(0).toUpperCase() + lower.slice(1), t.toUpperCase()])];
}

/** The hex behind an npub, or null. Hex passed straight through, lowercased. */
export function pubkeyParam(raw: string): string | null {
  const v = String(raw ?? "").trim();
  if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
  try {
    const decoded = nip19.decode(v.toLowerCase());
    if (decoded.type === "npub" && typeof decoded.data === "string") return decoded.data;
  } catch {
    /* a failed checksum is not a key */
  }
  return null;
}

/**
 * Is this exactly one finished key? Either spelling: unlike the relay's own field, a pasted
 * hex key is a finished token here, because this app's URLs and its `from:` scope have always
 * carried hex and rewriting it to an npub would break a link somebody already shared.
 */
export const isKey = (v: string): boolean => !!pubkeyParam(String(v ?? "").trim());

// ---- segments -------------------------------------------------------------

export interface TextSeg { type: "text"; text: string }
export interface KeySeg { type: "key"; raw: string; field: "from" | "to" | null; pubkey: string }
export interface PointerSeg { type: "pointer"; raw: string; field: "to"; tag: "e" | "a"; value: string }
export interface DateSeg { type: "date"; raw: string; field: "since" | "until"; at: number; day: string }
export interface TagSeg { type: "tag"; raw: string; tag: string }
export interface LabelSeg { type: "label"; raw: string; value: string }
export interface ScopeSeg { type: "scope"; raw: string; field: string; value: string }
export interface GroupSeg { type: "group"; raw: string; id: string }
export interface SortSeg { type: "sort"; raw: string; value: string }
export interface ObserverSeg { type: "observer"; raw: string; pubkey: string }
export interface LensSeg { type: "lens"; raw: string }
export interface FloorSeg { type: "floor"; raw: string; value: number }
export interface VerifiedSeg { type: "verified"; raw: string }
export interface ReachSeg { type: "reach"; raw: string; value: "follows" | "friends" }

export type TokenSeg =
  | KeySeg | PointerSeg | DateSeg | TagSeg | LabelSeg | ScopeSeg | GroupSeg
  | SortSeg | ObserverSeg | LensSeg | FloorSeg | VerifiedSeg | ReachSeg;
export type Segment = TextSeg | TokenSeg;

/** The hashtags inside one stretch of plain text, as segments in place. */
function tagSegments(chunk: string, out: Segment[]): void {
  let at = 0;
  HASHTAG.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = HASHTAG.exec(chunk)); ) {
    const start = m.index + m[1].length;
    const raw = chunk.slice(start, HASHTAG.lastIndex);
    const tag = m[2].replace(/-+$/, "").toLowerCase();
    // A tag that is nothing but hyphens normalizes to empty and is not a tag.
    if (!tag) continue;
    if (start > at) out.push({ type: "text", text: chunk.slice(at, start) });
    // `raw` keeps the trailing hyphen, or the pill would cover fewer characters than it stands for.
    out.push({ type: "tag", raw, tag });
    at = HASHTAG.lastIndex;
  }
  if (at < chunk.length) out.push({ type: "text", text: chunk.slice(at) });
}

/**
 * Which tag a `to:` pointer is asked with and the value it carries: `#e` for an event, `#a` for
 * an addressable one's coordinate. Null for anything that does not decode to one of the two.
 */
function pointerAsk(raw: string): { tag: "e" | "a"; value: string } | null {
  try {
    const p = nip19.decode(raw.toLowerCase());
    if (p.type === "note" && typeof p.data === "string") return { tag: "e", value: p.data };
    if (p.type === "nevent") return { tag: "e", value: (p.data as { id: string }).id };
    if (p.type === "naddr") {
      const a = p.data as { kind: number; pubkey: string; identifier: string };
      return { tag: "a", value: `${a.kind}:${a.pubkey}:${a.identifier}` };
    }
  } catch {
    /* a failed checksum stays text */
  }
  return null;
}

/**
 * The typed string as segments: `{ type: "text", text }` and the tokens in it, each carrying
 * `raw` exactly as typed, so a renderer can put it back verbatim, beside its normalised value.
 * A corrupt value (a failed checksum, a day that does not exist) stays text.
 */
export function tokenize(text: string): Segment[] {
  const s = String(text ?? "");
  const out: Segment[] = [];
  let at = 0;
  TOKEN.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = TOKEN.exec(s)); ) {
    const g = m.groups as Record<string, string | undefined>;
    const start = m.index + (g.lead ?? "").length;
    const raw = s.slice(start, TOKEN.lastIndex);
    let seg: TokenSeg;
    if (g.key || g.keyhex) {
      const pubkey = pubkeyParam((g.key ?? g.keyhex) as string);
      if (!pubkey) continue;
      const prefix = g.who ?? g.whohex;
      const field = prefix ? (prefix.slice(0, -1).toLowerCase() as "from" | "to") : null;
      seg = { type: "key", raw, field, pubkey };
    } else if (g.ptr) {
      // A pointer whose checksum fails stays text, exactly as a corrupt npub does.
      const ask = pointerAsk(g.ptr);
      if (!ask) continue;
      seg = { type: "pointer", raw, field: "to", tag: ask.tag, value: ask.value };
    } else if (g.floor !== undefined) {
      const value = Number(g.floor);
      // 0..100 is the rank scale; anything else is not this filter and stays text.
      if (!Number.isFinite(value) || value > 100) continue;
      seg = { type: "floor", raw, value };
    } else if (g.lens) {
      seg = { type: "lens", raw };
    } else if (g.obs) {
      const pubkey = pubkeyParam(g.obs);
      if (!pubkey) continue;
      seg = { type: "observer", raw, pubkey };
    } else if (g.order) {
      // Case-exact, as the store lexes it; an unknown order still pills, since only the
      // store knows the whole list and a pill that refuses one would lie about a working query.
      seg = { type: "sort", raw, value: g.order };
    } else if (g.trust) {
      seg = { type: "verified", raw };
    } else if (g.hops) {
      seg = { type: "reach", raw, value: g.hops.toLowerCase() as "follows" | "friends" };
    } else if (g.lbl) {
      seg = { type: "label", raw, value: g.lid as string };
    } else if (g.ext) {
      const field = g.ext.slice(0, -1).toLowerCase();
      // A scope with no askable id (`site:#top`) is not a token: the pill would
      // claim a filter while buildFilters sent none.
      if (!scopeIds(field, g.sid as string).length) continue;
      seg = { type: "scope", raw, field, value: g.sid as string };
    } else if (g.grp) {
      seg = { type: "group", raw, id: g.gid as string };
    } else {
      const field = (g.when as string).slice(0, -1).toLowerCase() as "since" | "until";
      const bound = dayBound(g.day as string, field);
      if (bound == null) continue;
      seg = { type: "date", raw, field, at: bound, day: g.day as string };
    }
    if (start > at) tagSegments(s.slice(at, start), out);
    out.push(seg);
    at = TOKEN.lastIndex;
  }
  if (at < s.length) tagSegments(s.slice(at), out);
  return out;
}

/** The token types that pill only once the caret has left them. */
const SETTLES = new Set([
  "tag", "date", "scope", "group", "label", "sort", "observer", "lens", "floor", "verified", "reach",
]);

/**
 * The segments to draw: [tokenize]'s, minus the settling token the caret is inside, which stays
 * text until the caret leaves. `typingAt` null draws everything.
 */
export function drawable(text: string, typingAt: number | null): Segment[] {
  const segs = tokenize(text);
  if (typingAt == null) return segs;
  let at = 0;
  return segs.map((seg) => {
    const start = at;
    if (seg.type === "text") { at += seg.text.length; return seg; }
    at += seg.raw.length;
    if (!SETTLES.has(seg.type) || typingAt <= start || typingAt > at) return seg;
    return { type: "text", text: seg.raw };
  });
}

// ---- what the relay is asked ----------------------------------------------

export interface ParsedQuery {
  /**
   * What the NIP-50 `search` gets: the words, with the relay's own ranking tokens still
   * standing where they were typed. Everything that becomes a NIP-01 field is out of it.
   */
  terms: string;
  /**
   * The words alone — [terms] without the ranking tokens. What "did this person actually
   * search for anything?" means: a box holding only `sort:recent` is a browse, not a search.
   */
  words: string;
  authors: string[];
  mentions: string[];
  cites: string[];
  addrs: string[];
  hashtags: string[];
  labels: string[];
  scopes: { field: string; value: string }[];
  groups: string[];
  since: number | null;
  until: number | null;
  /** The ranking tokens, which ride the search string rather than becoming fields. */
  sort: string | null;
  observer: string | null;
  includeSpam: boolean;
  rankFloor: number | null;
  /** Honoured by this client alone; the relay has no hops and no verification. */
  verifiedOnly: boolean;
  reach: "follows" | "friends" | null;
}

/**
 * What the relay is asked, from what the person typed. Two of one date prefix keep the narrower
 * bound; two of one ranking token keep the last, which is how the store's own lexer reads them;
 * a bare npub stays a term.
 */
export function parseQuery(text: string): ParsedQuery {
  const out: ParsedQuery = {
    terms: "", authors: [], mentions: [], cites: [], addrs: [], hashtags: [], labels: [],
    scopes: [], groups: [], since: null, until: null, words: "",
    sort: null, observer: null, includeSpam: false, rankFloor: null,
    verifiedOnly: false, reach: null,
  };
  let terms = "";
  let words = "";
  const add = (into: string[], v: string) => { if (!into.includes(v)) into.push(v); };
  for (const seg of tokenize(text)) {
    switch (seg.type) {
      case "text": terms += seg.text; words += seg.text; break;
      case "tag": add(out.hashtags, seg.tag); break;
      // The same `to:` question about an event: which tag it is asked with is the pointer's shape.
      case "pointer": add(seg.tag === "e" ? out.cites : out.addrs, seg.value); break;
      // A mark is opaque and asked as it stands; the spellings worth asking are tagValues's question.
      case "label": add(out.labels, seg.value); break;
      // Verbatim, deduped as typed; the spellings worth asking are scopeIds's question.
      case "scope":
        if (!out.scopes.some((s) => s.field === seg.field && s.value === seg.value)) {
          out.scopes.push({ field: seg.field, value: seg.value });
        }
        break;
      // Verbatim and case-exact: a group id is opaque, and `General` and `general` are two groups.
      case "group": add(out.groups, seg.id); break;
      case "date":
        if (seg.field === "since") out.since = out.since == null ? seg.at : Math.max(out.since, seg.at);
        else out.until = out.until == null ? seg.at : Math.min(out.until, seg.at);
        break;
      // The four ranking tokens are the relay's own NIP-50 extensions: they are read out
      // here for the Filters panel AND left standing in `terms`, exactly where they were
      // typed, because the store is what parses them.
      case "sort": out.sort = seg.value; terms += seg.raw; break;
      case "observer": out.observer = seg.pubkey; terms += seg.raw; break;
      case "lens": out.includeSpam = true; terms += seg.raw; break;
      case "floor": out.rankFloor = seg.value; terms += seg.raw; break;
      // These two the relay knows nothing about (it has no hops and no verification), so
      // they come out of `terms`: sent as text they would match nothing.
      case "verified": out.verifiedOnly = true; break;
      case "reach": out.reach = seg.value; break;
      case "key": {
        const into = seg.field === "from" ? out.authors : seg.field === "to" ? out.mentions : null;
        if (!into) { terms += seg.raw; words += seg.raw; break; }
        add(into, seg.pubkey);
        break;
      }
    }
  }
  out.terms = tidyTerms(terms);
  out.words = tidyTerms(words);
  return out;
}

// ---- the canonical spellings a tag filter has to ask for -------------------

/**
 * The NIP-73 web ids a `site:` value may be written as, canonical first: fragment dropped, both
 * schemes when none was typed, and each with and without its trailing slash.
 */
function siteIds(value: string): string[] {
  const bare = value.replace(/#.*$/, "");
  if (!bare) return [];
  const typed = /^[a-z][a-z0-9+.-]*:\/\//i.test(bare) ? [bare] : [`https://${bare}`, `http://${bare}`];
  // Scheme and host lowercased, canonical first; the path keeps its case.
  const cased = typed.flatMap((u) => {
    const m = /^([a-z][a-z0-9+.-]*:\/\/)([^/]*)(.*)$/i.exec(u);
    return m ? [m[1].toLowerCase() + m[2].toLowerCase() + m[3], u] : [u];
  });
  return [...new Set(cased.flatMap((u) => [u, u.endsWith("/") ? u.slice(0, -1) : `${u}/`]))];
}

/**
 * Every spelling of one scope worth a tag filter's while, canonical first and as typed beside
 * it: `isbn:` drops hyphens, `geo:` and `doi:` are lowercase, `isan:` is uppercase and also
 * asked as its 5-segment root, and `podcast:publisher:` takes a `guid:` segment.
 */
export function scopeIds(field: string, value: string): string[] {
  const v = String(value ?? "");
  if (!v) return [];
  if (field === "site") return siteIds(v);
  if (field === "isbn") return [...new Set([`isbn:${v.replace(/-/g, "")}`, `isbn:${v}`])];
  if (field === "geo") return [...new Set([`geo:${v.toLowerCase()}`, `geo:${v}`])];
  if (field === "doi") return [...new Set([`doi:${v.toLowerCase()}`, `doi:${v}`])];
  if (field === "isan") {
    const parts = v.split("-");
    const root = parts.length === 8 ? parts.slice(0, 5).join("-") : v;
    return [...new Set([`isan:${root.toUpperCase()}`, `isan:${root}`, `isan:${v.toUpperCase()}`, `isan:${v}`])];
  }
  if (field === "podcast:publisher" && !/^guid:/i.test(v)) {
    return [...new Set([
      `podcast:publisher:guid:${v}`, `podcast:publisher:guid:${v.toLowerCase()}`,
      `podcast:publisher:${v}`, `podcast:publisher:${v.toLowerCase()}`,
    ])];
  }
  return [...new Set([`${field}:${v}`, `${field}:${v.toLowerCase()}`])];
}

/** What a scope pill says it is, in words rather than a prefix. */
export const SCOPE_NOUNS: Record<string, string> = {
  site: "web page",
  isbn: "book",
  doi: "paper",
  geo: "place",
  isan: "film",
  "podcast:guid": "podcast",
  "podcast:item:guid": "episode",
  "podcast:publisher": "publisher",
};

// ---- the caret probes the pickers hang off ---------------------------------

export interface PartialToken {
  field: string;
  partial: string;
  start: number;
  end: number;
  complete: boolean;
}

/**
 * A prefixed token the caret is inside, or null: `{ field, partial, start, end, complete }`,
 * with offsets into `text` so a pick can splice the finished token in.
 */
function partialAt(
  text: string,
  caret: number,
  re: RegExp,
  finished: (partial: string, field: string) => boolean,
): PartialToken | null {
  const s = String(text ?? "");
  const end = Math.max(0, Math.min(Number(caret) || 0, s.length));
  const rest = s.slice(end);
  if (rest && !/^\s/.test(rest)) return null;
  const m = re.exec(s.slice(0, end));
  if (!m) return null;
  const field = m[2].toLowerCase();
  return { field, partial: m[3], start: m.index + m[1].length, end, complete: finished(m[3], field) };
}

/** The `from:`/`to:` token the caret is inside — what the people picker asks. */
export const mentionAt = (text: string, caret: number): PartialToken | null =>
  partialAt(text, caret, PARTIAL, isKey);

/**
 * The `since:`/`until:` token the caret is inside, which the calendar opens on; complete once it
 * is a real day.
 */
export const dateAt = (text: string, caret: number): PartialToken | null =>
  partialAt(text, caret, PARTIAL_DAY, (v, f) => dayBound(v, f) != null);

/**
 * The `group:` token the caret is inside, which the group picker asks. Never `complete`:
 * `group:gen` is a plausible id and a prefix of `general`, so only a space ends it.
 */
export const groupAt = (text: string, caret: number): PartialToken | null =>
  partialAt(text, caret, PARTIAL_GROUP, () => false);

// ---- the REQ ---------------------------------------------------------------

// A NIP-22 comment names its thread's root scope in `I` and its parent's in `i`. One filter
// per tag: both in one filter would AND them and drop the deeper replies.
const COMMENT_KIND = 1111;
const COMMENT_SCOPE_TAGS = ["#I", "#i"] as const;

// NIP-32. A `label:` asks for the labels themselves, so its filter names this kind over the tab's:
// 1985 is on no tab, and the mark is on the label, not on what it names.
const LABEL_KIND = 1985;

// A NIP-29 group's own metadata, signed by the host relay's key.
const GROUP_META_KIND = 39000;
// Single letter, so the store indexes it in `tag_index` exactly as it does `t`.
const GROUP_TAG = "#h";

/**
 * The NIP-73 external ids a hashtag is written as, for a comment's `i`/`I`: `#topic` per the
 * spec, plus the unprefixed form some clients reused.
 */
const hashtagIds = (tags: string[]): string[] => tags.flatMap((t) => [`#${t}`, t]);

/** The `#t`/`#l` value list for a set of hashtags: every spelling, deduped. */
const tagAsks = (tags: string[]): string[] => [...new Set(tags.flatMap(tagValues))];

/** The `#I`/`#i` value list for a set of scopes: every spelling, deduped. */
const scopeAsks = (scopes: { field: string; value: string }[]): string[] =>
  [...new Set(scopes.flatMap((s) => scopeIds(s.field, s.value)))];

/** How many results a secondary filter of a union may return; the store applies `limit` per filter. */
const sideLimit = (limit: number): number => Math.max(4, Math.round(limit / 4));

export interface BuildOptions {
  /** The tab's kinds, or null for all. */
  kinds?: number[] | null;
  limit: number;
  /** The caller's NIP-50 builder — it appends the lens the page is read through. */
  searchString?: (terms: string) => string;
  /** Extra NIP-01 fields every filter of the union carries (the Live tab's host `#p`, say). */
  base?: Filter;
  /** A `since` the caller imposes over the query's own (a paging boundary). */
  since?: number;
}

/**
 * The typed string as the REQ the page sends: NIP-01 filters ORed in one subscription. A
 * hashtag asks `t`, `i`/`I` and `l`; a scope asks the comment question alone; a group asks `h`
 * plus its kind-39000 metadata; a `label:` asks the label events under that mark. Only the
 * hashtag comment filters are gated on the tab.
 *
 * Kept filter-for-filter identical to the relay operator page's `buildFilters`, because a query
 * that returns one set of events there and another here is the bug neither side can see.
 */
export function buildFilters(text: string, opts: BuildOptions): Filter[] {
  const { kinds = null, limit, searchString = (t: string) => t, base: extra = {}, since } = opts;
  const q = parseQuery(text);
  const base: Filter = { ...extra };
  const search = searchString(q.terms);
  if (search.trim()) base.search = search;
  if (kinds) base.kinds = kinds;
  if (q.authors.length) base.authors = q.authors;
  if (q.mentions.length) base["#p"] = [...new Set([...(base["#p"] ?? []), ...q.mentions])];
  if (q.cites.length) base["#e"] = q.cites;
  if (q.addrs.length) base["#a"] = q.addrs;
  // On `base`, so the window rides every filter of a union.
  const from = since !== undefined ? since : q.since;
  if (from != null) base.since = from;
  if (q.until != null) base.until = q.until;
  const scoped = scopeAsks(q.scopes);
  if (!q.hashtags.length && !scoped.length && !q.groups.length && !q.labels.length) {
    return [{ ...base, limit }];
  }

  const side = sideLimit(limit);
  const filters: Filter[] = [];
  if (q.labels.length) filters.push({ ...base, kinds: [LABEL_KIND], "#l": tagAsks(q.labels), limit });
  if (q.groups.length) {
    filters.push({ ...base, [GROUP_TAG]: q.groups, limit });
    filters.push({ ...base, kinds: [GROUP_META_KIND], "#d": q.groups, limit: side });
  }
  if (q.hashtags.length) {
    filters.push({ ...base, "#t": tagAsks(q.hashtags), limit });
    filters.push({ ...base, "#l": tagAsks(q.hashtags), limit: side });
    if (!kinds || kinds.includes(COMMENT_KIND)) {
      const ids = hashtagIds(q.hashtags);
      for (const tag of COMMENT_SCOPE_TAGS) {
        filters.push({ ...base, kinds: [COMMENT_KIND], [tag]: ids, limit: side });
      }
    }
  }
  if (scoped.length) {
    filters.push({ ...base, kinds: [COMMENT_KIND], "#I": scoped, limit });
    filters.push({ ...base, kinds: [COMMENT_KIND], "#i": scoped, limit: side });
  }
  return filters;
}
