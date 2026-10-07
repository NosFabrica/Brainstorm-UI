/**
 * One event, any kind, as the All tab's row reads it: a title, a line or two of
 * words, a picture, and a few short facts. The All tab is the relay's answer
 * with no kinds asked, so whatever comes back gets a row — a kind nobody here
 * has a card for still says what it is called, what it says and what it shows.
 *
 * The shape is the search relay's own web UI (NosFabrica/vespa-relay, its
 * generic card and family cards): title from `title`/`name`/`subject`, words
 * from `summary`/`description`/`alt` or the content, picture from
 * `image`/`thumb`/`picture`/`icon`. Kinds with a parser of their own here
 * (listings, calendar events, tracks, things, profiles) read through it, so a
 * row and the kind's own page agree.
 */
import { nip19 } from "nostr-tools";
import { contentShape } from "@/lib/contentShape";
import { formatEventDate, parseCalendarEvent, shortPlace } from "@/lib/calendarEvent";
import { formatListingPrice, parseListing } from "@/lib/listing";
import { mediaPosterOf, mediaUrlOf } from "@/lib/mediaKind";
import { describeDesignation } from "@/lib/nip85Declaration";
import { describeThing, THING_KINDS } from "@/lib/thing";
import { parseTrack, TRACK_KINDS } from "@/lib/trackEvent";
import { wikiPlainText } from "@/lib/wiki";
import { eventPath } from "@/lib/shareId";
import { readKind, who, type ResultRef } from "@/lib/resultReaders";

export type { ResultRef } from "@/lib/resultReaders";

type SummaryEvent = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export interface ResultSummary {
  title: string | null;
  /** Plain words: no markdown, no ciphertext. */
  body: string | null;
  /** What the content is when it is not words to read — said in place of them. */
  shape: "encrypted" | "json" | null;
  image: string | null;
  /** Short, quiet, in order: a price, a date and place, a duration, a status. */
  facts: string[];
  /** The kind's own full page. */
  href: string;
  /** The event this one is about — a reaction's note, a zap's post — quoted in a line once resolved. */
  ref: ResultRef | null;
  /** The event it is about, when it travels inside this one (a repost carries its note). */
  embedded: SummaryEvent | null;
  /** The body is code: shown as written, in a monospace face. */
  code: boolean;
}

const tagOf = (ev: SummaryEvent, ...names: string[]): string | null => {
  for (const name of names) {
    const v = ev.tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1].trim())?.[1];
    if (v) return v.trim();
  }
  return null;
};

/** A `summary` or `description` that is words — a zap receipt's `description` is its request, as JSON. */
const proseTag = (ev: SummaryEvent): string | null => {
  const v = tagOf(ev, "summary", "description");
  return v && !/^\s*[{[]/.test(v) ? v : null;
};

const isHttp = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);

/** A `d` that is a UUID, a hex blob or a bare timestamp is never a title. */
const OPAQUE_D = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|\d{10,})$/i;

function genericTitle(ev: SummaryEvent): string | null {
  const named = tagOf(ev, "title", "name", "subject");
  if (named) return named;
  // A NIP-53 room names itself in `room`; its `d` is a slug that only looks like a name.
  if (ev.kind === 30312) {
    const room = tagOf(ev, "room");
    if (room) return room;
  }
  // A D-list header names its list in the plural (`titles`/`names`, singular then plural).
  const pair = ev.tags.find((t) => (t[0] === "titles" || t[0] === "names") && t[2]?.trim());
  if (pair) return pair[2].trim();
  const d = tagOf(ev, "d");
  return d && !OPAQUE_D.test(d) ? d : null;
}

function genericImage(ev: SummaryEvent): string | null {
  const tagged = tagOf(ev, "image", "thumb", "picture", "icon", "cover", "banner");
  if (isHttp(tagged)) return tagged;
  const media = mediaUrlOf(ev);
  if (media && /\.(?:jpe?g|png|gif|webp|avif)(?:[?#]|$)/i.test(media)) return media;
  const poster = mediaPosterOf(ev);
  return isHttp(poster) ? poster : null;
}

/** Markdown reduced to the prose a two-line snippet shows — text, never markup. */
export function markdownExcerpt(md: string): string {
  return md
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, " ") // fenced code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links keep their words
    .replace(/<[^>]+>/g, " ") // inline html
    .split("\n")
    .map((l) =>
      l
        .replace(/^\s{0,3}#{1,6}\s+/, "") // headings
        .replace(/^\s*(?:[-*_=]\s*){3,}$/, "") // rules
        .replace(/^\s*>\s?/, "") // quotes
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "") // list markers
        .replace(/(\*\*|__|\*|_|`)/g, ""),
    )
    .filter((l) => l.trim() && !/^\s*\|?[\s:|-]*\|[\s:|-]*$/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** String fields a JSON content names itself by — an agent's, a persona's, a file's. */
const JSON_TITLES = ["title", "name", "display_name", "displayName"];
const JSON_BODIES = ["description", "about", "summary", "bio", "text", "instructions", "content", "system_prompt"];

/** A JSON content's own title and words, when it carries them. */
function jsonWords(content: string): { title: string | null; body: string | null } {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { title: null, body: null };
    const obj = parsed as Record<string, unknown>;
    const str = (k: string) =>
      typeof obj[k] === "string" && (obj[k] as string).trim() ? (obj[k] as string).trim() : null;
    return {
      title: JSON_TITLES.map(str).find(Boolean) ?? null,
      body: JSON_BODIES.map(str).find(Boolean) ?? null,
    };
  } catch {
    return { title: null, body: null };
  }
}

/** The words of an event's content, or what it is when it isn't words. */
function contentWords(ev: SummaryEvent): { body: string | null; shape: ResultSummary["shape"] } {
  const shape = contentShape(ev.content);
  if (shape.kind === "encrypted") return { body: null, shape: "encrypted" };
  if (shape.kind === "json") {
    const words = jsonWords(ev.content).body;
    return words ? { body: markdownExcerpt(words), shape: null } : { body: null, shape: "json" };
  }
  if (shape.kind === "empty") return { body: null, shape: null };
  if (ev.kind === 30818) return { body: wikiPlainText(ev.content), shape: null };
  // Notes are written in markdown too ("[Fiatjaf](https://…)"): every body is read as prose.
  return { body: markdownExcerpt(ev.content) || null, shape: null };
}

const fmtDuration = (secs: number): string => {
  const s = Math.round(secs);
  const two = (n: number) => String(n).padStart(2, "0");
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`
    : `${Math.floor(s / 60)}:${two(s % 60)}`;
};

/** Tags that are structure, not an item's fields — never a fact. */
const STRUCTURAL_TAGS = new Set([
  "d",
  "z",
  "e",
  "p",
  "a",
  "q",
  "t",
  "k",
  "client",
  "alt",
  "name",
  "title",
  "summary",
  "description",
  "image",
  "thumb",
  "picture",
  "icon",
  "license",
  "source",
  "published_at",
  "expiration",
]);

/** A D-list item's own fields (a place's category, country, cuisine), the short ones, as facts. */
function itemFacts(ev: SummaryEvent): string[] {
  const out: string[] = [];
  for (const t of ev.tags) {
    if (out.length >= 4) break;
    const v = typeof t[1] === "string" ? t[1].trim() : "";
    if (
      STRUCTURAL_TAGS.has(t[0]) ||
      /(?:^|[-_])id$/i.test(t[0]) ||
      !v ||
      v.length > 32 ||
      /^https?:\/\//i.test(v) ||
      /^[0-9a-f]{64}$/i.test(v)
    )
      continue;
    if (/^-?\d+\.\d{4,}$/.test(v)) continue; // coordinates, ids: not for reading
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

/** The `e` (else `a`) a repost names, when it does not carry its note. */
function refFromTags(ev: SummaryEvent): ResultRef | null {
  const e = ev.tags.find((t) => t[0] === "e" && /^[0-9a-f]{64}$/i.test(t[1] ?? ""));
  if (e) return { id: e[1].toLowerCase(), relay: e[2] || undefined };
  const a = ev.tags.find((t) => t[0] === "a" && /^\d+:[0-9a-f]{64}:/i.test(t[1] ?? ""));
  return a ? { addr: a[1], relay: a[2] || undefined } : null;
}

function profilePathOf(pubkey: string): string {
  try {
    return `/p/${nip19.npubEncode(pubkey)}`;
  } catch {
    return `/p/${pubkey}`;
  }
}

/**
 * The words without the title said again: long-form opens with its own heading
 * (often behind a byline — "Bitcoin Magazine Senate Banking…"), and two lines
 * spent repeating the line above them say nothing.
 */
function withoutTitle(body: string | null, title: string | null): string | null {
  if (!body || !title) return body;
  // The whole title, as words — "T" is not found inside "Short".
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").exec(body);
  if (!m || m.index > 60) return body;
  const rest = body.slice(m.index + m[0].length).replace(/^[\s:.,—–-]+/, "");
  return rest || null;
}

/**
 * The summary, read once per event: a streaming list re-renders on every
 * arriving hit, and the rows it already holds should not be read again.
 */
const SUMMARIES = new WeakMap<object, ResultSummary>();
export function summaryOf(ev: SummaryEvent): ResultSummary {
  let s = SUMMARIES.get(ev);
  if (!s) {
    s = summarizeResult(ev);
    SUMMARIES.set(ev, s);
  }
  return s;
}

export function summarizeResult(ev: SummaryEvent): ResultSummary {
  const s = summarizeKind(ev);
  return { ...s, body: s.code ? s.body : withoutTitle(s.body, s.title) };
}

const EVENT_SHAPE = (v: unknown): v is SummaryEvent => {
  const e = v as SummaryEvent | null;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.pubkey === "string" &&
    typeof e.kind === "number" &&
    typeof e.content === "string" &&
    Array.isArray(e.tags)
  );
};

/** A repost's note, when the repost carries it (NIP-18 puts the JSON in the content). */
function repostedEvent(ev: SummaryEvent): SummaryEvent | null {
  try {
    const inner: unknown = JSON.parse(ev.content);
    return EVENT_SHAPE(inner) ? inner : null;
  } catch {
    return null;
  }
}

function summarizeKind(ev: SummaryEvent): ResultSummary {
  const base: ResultSummary = {
    title: genericTitle(ev),
    body: proseTag(ev),
    shape: null,
    image: genericImage(ev),
    facts: [],
    href: eventPath(ev),
    ref: null,
    embedded: null,
    code: false,
  };
  const fillFromContent = (s: ResultSummary): ResultSummary => {
    const json = contentShape(ev.content).kind === "json" ? jsonWords(ev.content) : null;
    const titled = !s.title && json?.title ? { ...s, title: json.title } : s;
    if (titled.body) return titled;
    const words = contentWords(ev);
    return { ...titled, body: words.body ?? tagOf(ev, "alt"), shape: words.body ? null : words.shape };
  };

  if (ev.kind === 0) {
    let meta: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(ev.content);
      if (parsed && typeof parsed === "object") meta = parsed as Record<string, unknown>;
    } catch {
      /* a profile we cannot read is still a person */
    }
    const str = (k: string) =>
      typeof meta[k] === "string" && (meta[k] as string).trim() ? (meta[k] as string).trim() : null;
    return {
      ...base,
      title: str("display_name") ?? str("displayName") ?? str("name"),
      body: str("about"),
      // Their face is already the byline's, beside their name: no second one on the right.
      image: null,
      facts: [str("nip05"), str("website")].filter((f): f is string => !!f).slice(0, 2),
      href: profilePathOf(ev.pubkey),
    };
  }

  const listing = parseListing(ev);
  if (listing) {
    const status = listing.hidden ? "Hidden" : listing.status !== "active" ? listing.status : null;
    return {
      ...base,
      title: listing.title,
      body: listing.summary ?? (listing.description ? markdownExcerpt(listing.description) : null),
      image: listing.images[0] ?? base.image,
      facts: [
        listing.price ? formatListingPrice(listing.price) : null,
        listing.location ? shortPlace(listing.location) : null,
        status ? status.charAt(0).toUpperCase() + status.slice(1) : null,
      ].filter((f): f is string => !!f),
    };
  }

  if (ev.kind === 31922 || ev.kind === 31923) {
    const cal = parseCalendarEvent(ev);
    return {
      ...base,
      title: cal.title,
      body: cal.summary ? markdownExcerpt(cal.summary) : null,
      image: isHttp(cal.image) ? cal.image : base.image,
      facts: [
        cal.startSec ? formatEventDate(cal.startSec, cal.isDateOnly) : null,
        cal.location ? shortPlace(cal.location) : null,
      ].filter((f): f is string => !!f),
    };
  }

  if (TRACK_KINDS.has(ev.kind)) {
    const track = parseTrack(ev);
    if (track)
      return fillFromContent({
        ...base,
        title: track.title,
        image: isHttp(track.cover) ? track.cover : base.image,
        facts: [track.artist ?? null, track.durationSec ? fmtDuration(track.durationSec) : null].filter(
          (f): f is string => !!f,
        ),
      });
  }

  if (ev.kind === 10040) {
    const d = describeDesignation(ev);
    return { ...base, title: base.title ?? "Trust designation", body: d.summary || null };
  }

  if (THING_KINDS.has(ev.kind)) {
    const thing = describeThing(ev);
    if (thing)
      return fillFromContent({
        ...base,
        title: thing.title,
        body: thing.description,
        image: isHttp(thing.image) ? thing.image : base.image,
      });
  }

  if (ev.kind === 30311) {
    const status = tagOf(ev, "status");
    return fillFromContent({
      ...base,
      facts: status ? [status.charAt(0).toUpperCase() + status.slice(1)] : [],
    });
  }

  // A D-list item is its fields: a place's name, then what it is and where.
  if (ev.kind === 39999 || ev.kind === 9999) {
    return fillFromContent({ ...base, facts: itemFacts(ev) });
  }

  // A repost is the note it reposts, said as one: its words, its picture, whose it was.
  if (ev.kind === 6 || ev.kind === 16) {
    const inner = repostedEvent(ev);
    const of = inner?.pubkey ?? ev.tags.find((t) => t[0] === "p")?.[1];
    if (inner) {
      const s = summarizeResult(inner);
      return {
        ...base,
        title: s.title,
        body: s.body,
        image: s.image,
        facts: [`Repost of ${who(of)}`],
        embedded: inner,
      };
    }
    return { ...base, title: null, body: null, facts: [`Repost of ${who(of)}`], ref: refFromTags(ev) };
  }

  // The kinds whose meaning is in their tags: what they did, to whom, about what.
  const read = readKind(ev);
  if (read) {
    const tagBody = proseTag(ev);
    const body = read.code
      ? (read.body ?? null)
      : (tagBody ?? (read.body !== undefined ? read.body : (contentWords(ev).body ?? tagOf(ev, "alt"))));
    return {
      ...base,
      title: read.title ?? base.title,
      body: body && !read.code ? markdownExcerpt(body) : body,
      shape: read.encrypted && !body ? "encrypted" : null,
      facts: read.facts ?? [],
      ref: read.ref ?? null,
      code: !!read.code,
    };
  }

  return fillFromContent(base);
}
