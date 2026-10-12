/**
 * The Media tab's two chips that change what the relay is asked, where
 * Photos and Audio only sort through the page already loaded.
 *
 *  - **Videos** asks the four NIP-71 kinds and nothing else.
 *  - **Classic Vines** asks the Vines Divine restored from the archive: kind
 *    34236 carrying the NIP-32 label `vine-archive`.
 *
 * A chosen chip is tokens in the query, not state of its own: Videos is the
 * `kind:` tokens `services/search` already narrows a tab by, and Classic
 * Vines is the hashtag `#vine-archive`. So the address bar's `q` holds it, a
 * link reproduces it, Back undoes it, and the box shows it as pills a reader
 * can take off.
 */
import { parseQuery, tokenize, type Segment } from "@/lib/searchQuery";

export type MediaFacet = "videos" | "vines";

export const MEDIA_FACET_LABELS: Record<MediaFacet, string> = { videos: "Videos", vines: "Classic Vines" };

/** NIP-71's kinds, in the order the Media tab lists them. lib/nip71's `VIDEO_KINDS`, held equal by the test. */
export const VIDEO_FACET_KINDS: readonly number[] = [21, 22, 34235, 34236];

/** The label the archive's importer puts on every restored Vine, and the hashtag that asks for it. */
export const VINE_ARCHIVE_LABEL = "vine-archive";
/** A restored Vine is a short. */
export const CLASSIC_VINE_KIND = 34236;

const isVideoKind = (kind: number) => VIDEO_FACET_KINDS.includes(kind);

/**
 * Which chip a query carries. Videos is exactly the four kinds: a hand-typed
 * `kind:34236` is the reader's own narrowing and presses nothing.
 */
export function mediaFacetOf(query: string): MediaFacet | null {
  const q = parseQuery(query);
  if (q.hashtags.includes(VINE_ARCHIVE_LABEL)) return "vines";
  if (q.kinds.length === VIDEO_FACET_KINDS.length && q.kinds.every(isVideoKind)) return "videos";
  return null;
}

export interface MediaNarrowing {
  /** The only kinds the query asks for. */
  kinds: readonly number[];
  /** Does this event answer the query's narrowing? */
  has: (event: { kind: number; tags: string[][] }) => boolean;
}

/**
 * What a query narrows the Media tab to, or null when it narrows nothing: its
 * typed kinds (`kind:`, `video:`) and, for Classic Vines, kind 34236 carrying
 * the archive's label. `services/search` asks the relay this; what the page
 * adds beside the relay's answer (the lead group of a named person's own
 * media) is held to the same test.
 */
export function mediaNarrowingOf(query: string): MediaNarrowing | null {
  const q = parseQuery(query);
  const vines = q.hashtags.includes(VINE_ARCHIVE_LABEL);
  if (!vines && !q.kinds.length) return null;
  const kinds = !vines
    ? q.kinds
    : q.kinds.length
      ? [CLASSIC_VINE_KIND].filter((kind) => q.kinds.includes(kind))
      : [CLASSIC_VINE_KIND];
  return {
    kinds,
    has: (event) =>
      kinds.includes(event.kind) && (!vines || event.tags.some((t) => t[0] === "l" && t[1] === VINE_ARCHIVE_LABEL)),
  };
}

/** The query put back together without the segments `drop` names. */
function without(query: string, drop: (seg: Segment) => boolean): string {
  return tokenize(query)
    .filter((seg) => !drop(seg))
    .map((seg) => (seg.type === "text" ? seg.text : seg.raw))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** The query without the archive's hashtag: on the Media tab it is asked as a label, not as a topic. */
export function withoutVineArchiveTag(query: string): string {
  return without(query, (seg) => seg.type === "tag" && seg.tag === VINE_ARCHIVE_LABEL);
}

/**
 * The query with `facet` chosen, or with neither chip when null. One chip at
 * a time: either one's tokens come out first, a hand-typed video kind with
 * them, and everything else stays where it was.
 */
export function withMediaFacet(query: string, facet: MediaFacet | null): string {
  const rest = without(
    query,
    (seg) => (seg.type === "tag" && seg.tag === VINE_ARCHIVE_LABEL) || (seg.type === "kind" && isVideoKind(seg.value)),
  );
  const tokens =
    facet === "videos"
      ? VIDEO_FACET_KINDS.map((kind) => `kind:${kind}`).join(" ")
      : facet === "vines"
        ? `#${VINE_ARCHIVE_LABEL}`
        : "";
  return `${rest} ${tokens}`.trim();
}

/**
 * `#vine-archive` and nothing else in the box. Any other lone hashtag is a
 * topic and goes to its page (lib/topicQuery); this one is the Media tab with
 * Classic Vines chosen.
 */
export function isClassicVinesTopic(boxText: string): boolean {
  return boxText.trim().toLowerCase() === `#${VINE_ARCHIVE_LABEL}`;
}
