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
  /** A face rather than a picture: a profile's avatar. */
  round: boolean;
  /** Short, quiet, in order: a price, a date and place, a duration, a status. */
  facts: string[];
  /** The kind's own full page. */
  href: string;
}

const tagOf = (ev: SummaryEvent, ...names: string[]): string | null => {
  for (const name of names) {
    const v = ev.tags.find((t) => t[0] === name && typeof t[1] === "string" && t[1].trim())?.[1];
    if (v) return v.trim();
  }
  return null;
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

/** The words of an event's content, or what it is when it isn't words. */
function contentWords(ev: SummaryEvent): { body: string | null; shape: ResultSummary["shape"] } {
  const shape = contentShape(ev.content);
  if (shape.kind === "encrypted") return { body: null, shape: "encrypted" };
  if (shape.kind === "json") return { body: null, shape: "json" };
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

export function summarizeResult(ev: SummaryEvent): ResultSummary {
  const s = summarizeKind(ev);
  return { ...s, body: withoutTitle(s.body, s.title) };
}

function summarizeKind(ev: SummaryEvent): ResultSummary {
  const base: ResultSummary = {
    title: genericTitle(ev),
    body: tagOf(ev, "summary", "description"),
    shape: null,
    image: genericImage(ev),
    round: false,
    facts: [],
    href: eventPath(ev),
  };
  const fillFromContent = (s: ResultSummary): ResultSummary => {
    if (s.body) return s;
    const words = contentWords(ev);
    return { ...s, body: words.body ?? tagOf(ev, "alt"), shape: words.body ? null : words.shape };
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
    const picture = str("picture") ?? str("image");
    return {
      ...base,
      title: str("display_name") ?? str("displayName") ?? str("name"),
      body: str("about"),
      image: isHttp(picture) ? picture : null,
      round: true,
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

  return fillFromContent(base);
}
