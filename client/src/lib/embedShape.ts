/**
 * What a quoted or linked event is drawn as, by its kind — and, where a kind
 * number is shared or abused, by what the event holds. A note that quotes a
 * video, a listing or a live stream showed the event's `content` and nothing
 * else: a stream's empty string, a listing's long description, a video's
 * caption without the video. Each shape here names the card that already
 * draws the kind elsewhere in the app (components/share/EmbeddedNoteCard).
 *
 * A shape is chosen only when the event can fill it — a kind-31337 with no
 * audio, a listing with no title, a video with no file named in its tags —
 * and anything else stays a "note": its words, with its kind named.
 */
import { isBlankEvent } from "@/lib/blankEvent";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { parseListing } from "@/lib/listing";
import { mediaKindOf } from "@/lib/mediaKind";
import { VIDEO_KINDS } from "@/lib/nip71";
import { describeThing, THING_KINDS, type Thing } from "@/lib/thing";
import { parseTrack, TRACK_KINDS } from "@/lib/trackEvent";
import { audioUrlFromEvent } from "@/lib/audioPlayer";
import { extractImageUrls } from "@/lib/noteContent";
import { TRUSTED_PEOPLE_KIND } from "@/lib/trustedList";
import type { MinimalEvent } from "@/lib/noteRefs";
import { gitItemTitleOf } from "@/lib/gitPatch";

type EventLike = Pick<MinimalEvent, "kind" | "tags" | "content">;

export type EmbedShape =
  /** The quoted event's words (NoteContent), its kind named when it is not a note. */
  | "note"
  /** Long-form: articles, drafts, publications and their sections, wiki pages, specs (EmbeddedArticleCard). */
  | "article"
  /** Bookmarks, curation sets, pins, interests (EmbeddedListCard). */
  | "item-list"
  /** Follow sets, starter packs, trusted lists: the face roster (ListCard). */
  | "people-list"
  /** Whatever lib/thing reads: communities, goals, reviews, shops, apps, calendars, badges… (ThingCard). */
  | "thing"
  /** A NIP-71 video whose file its tags name: poster and player. */
  | "video"
  /** A picture post (kind 20) or an image file (1063): the picture(s). */
  | "picture"
  /** A track or episode that names its audio (TrackCard). */
  | "track"
  /** A voice message, or an audio file: one player row (EmbeddedTrackCard). */
  | "audio"
  /** A NIP-53 stream (LiveCard). */
  | "live"
  /** A NIP-52 dated event (EventCard, with its date tile). */
  | "calendar-event"
  /** A classified, a NIP-15 product or auction (ListingCard). */
  | "listing"
  /** A Zap Store listing (AppCard). */
  | "app"
  /** A NIP-34 repo, patch, pull request or issue (RepoCard). */
  | "repo";

/** Long-form kinds drawn as the article teaser: article, draft, publication, section, bookshelf, spec, wiki. */
export const ARTICLE_EMBED_KINDS: ReadonlySet<number> = new Set([30023, 30024, 30040, 30041, 30045, 30817, 30818]);
/** Lists of people, drawn as their faces. */
export const PEOPLE_LIST_KINDS: ReadonlySet<number> = new Set([30000, 39089, TRUSTED_PEOPLE_KIND]);
export const LIVE_EMBED_KINDS: ReadonlySet<number> = new Set([30311]);
export const CALENDAR_EVENT_KINDS: ReadonlySet<number> = new Set([31922, 31923]);
export const LISTING_EMBED_KINDS: ReadonlySet<number> = new Set([30402, 30018, 30020]);
export const APP_EMBED_KINDS: ReadonlySet<number> = new Set([32267]);
export const REPO_EMBED_KINDS: ReadonlySet<number> = new Set([30617, 1617, 1618, 1621]);
export const PICTURE_KIND = 20;
export const FILE_KIND = 1063;
/** NIP-A0 voice messages: a root and a reply. */
export const VOICE_KINDS: ReadonlySet<number> = new Set([1222, 1244]);

/**
 * The kinds an address (`naddr`) may name and be drawn as a card of its own,
 * not as an article teaser or a list — what ThingAddressRef resolves. The
 * event it finds still has to fill the shape; one that does not stays a link.
 * Only replaceable (an empty `d`) and addressable kinds: what an `naddr` names.
 */
export const ADDRESS_CARD_KINDS: ReadonlySet<number> = new Set(
  [
    ...THING_KINDS,
    ...PEOPLE_LIST_KINDS,
    ...LIVE_EMBED_KINDS,
    ...CALENDAR_EVENT_KINDS,
    ...LISTING_EMBED_KINDS,
    ...APP_EMBED_KINDS,
    ...REPO_EMBED_KINDS,
    ...TRACK_KINDS,
    ...VIDEO_KINDS,
  ].filter((k) => (k >= 10000 && k < 20000) || (k >= 30000 && k < 40000)),
);

/** The file a video event's tags name (its imeta `url`, or a `url` tag) — never a link in its words. */
export function taggedVideoUrl(ev: EventLike): string | null {
  for (const t of ev.tags) {
    if (t[0] !== "imeta") continue;
    const part = t.slice(1).find((p) => p.startsWith("url "));
    const url = part?.slice(4).trim();
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  const url = ev.tags.find((t) => t[0] === "url")?.[1]?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** The pictures a picture post or image file shows, in order. */
export function embedPictures(ev: EventLike): string[] {
  if (ev.kind === FILE_KIND) {
    const url = ev.tags.find((t) => t[0] === "url")?.[1]?.trim();
    return url && /^https?:\/\//i.test(url) ? [url] : [];
  }
  return extractImageUrls(ev.content, ev.tags, { allImeta: true });
}

/** The audio a voice message or audio file plays: a tagged file, else the URL its content is. */
export function embedAudioUrl(ev: EventLike): string | null {
  const tagged = audioUrlFromEvent(ev);
  if (tagged) return tagged;
  const content = ev.content.trim();
  return VOICE_KINDS.has(ev.kind) && /^https?:\/\/\S+$/i.test(content) ? content : null;
}

const hasTag = (ev: EventLike, ...names: string[]) => ev.tags.some((t) => names.includes(t[0]) && !!t[1]?.trim());

/** A repo by its `name`, or by its identifier when it says where to get it; an issue, patch or PR by a title. */
function namedGitItem(ev: EventLike): boolean {
  if (ev.kind === 30617) return hasTag(ev, "name") || (hasTag(ev, "d") && hasTag(ev, "clone", "web", "description"));
  return !/^Untitled /.test(gitItemTitleOf(ev));
}

/** `thing`: the event already read by lib/thing, when the caller has it — it is not read twice. */
export function embedShapeOf(ev: MinimalEvent, thing?: Thing | null): EmbedShape {
  // Deleted by overwriting: the note card's quiet stub says so.
  if (isBlankEvent(ev)) return "note";
  const { kind } = ev;
  if (ITEM_LIST_KINDS.has(kind)) return "item-list";
  if (ARTICLE_EMBED_KINDS.has(kind)) return "article";
  if (THING_KINDS.has(kind)) return (thing !== undefined ? thing : describeThing(ev)) ? "thing" : "note";
  // A roster needs someone on it: a private follow set keeps its members in encrypted content.
  if (PEOPLE_LIST_KINDS.has(kind)) return ev.tags.some((t) => t[0] === "p" && t[1]?.trim()) ? "people-list" : "note";
  // A card needs a name to say: junk on these kinds would draw "Live event", a TBA tile, "Untitled app".
  if (LIVE_EMBED_KINDS.has(kind)) return hasTag(ev, "title", "name") ? "live" : "note";
  if (CALENDAR_EVENT_KINDS.has(kind)) return hasTag(ev, "title", "name", "start") ? "calendar-event" : "note";
  if (LISTING_EMBED_KINDS.has(kind)) return parseListing(ev) ? "listing" : "note";
  if (APP_EMBED_KINDS.has(kind)) return hasTag(ev, "name") ? "app" : "note";
  if (REPO_EMBED_KINDS.has(kind)) return namedGitItem(ev) ? "repo" : "note";
  if (TRACK_KINDS.has(kind)) return parseTrack(ev) ? "track" : "note";
  // A video that names its file in its words plays from there already (NoteContent).
  if (VIDEO_KINDS.has(kind)) return taggedVideoUrl(ev) ? "video" : "note";
  if (kind === PICTURE_KIND) return embedPictures(ev).length ? "picture" : "note";
  if (kind === FILE_KIND) {
    const media = mediaKindOf(ev);
    if (media === "photo" && embedPictures(ev).length) return "picture";
    if (media === "video" && taggedVideoUrl(ev)) return "video";
    if (media === "audio" && embedAudioUrl(ev)) return "audio";
    return "note";
  }
  if (VOICE_KINDS.has(kind)) return embedAudioUrl(ev) ? "audio" : "note";
  return "note";
}

/** Kinds whose words are a note's words: no label above them. */
const NOTE_KINDS: ReadonlySet<number> = new Set([1, 11, 1111]);

/** Whether a quote drawn as words names its kind — a quoted zap or reaction is not a mystery. */
export function namesItsKind(kind: number): boolean {
  return !NOTE_KINDS.has(kind);
}
