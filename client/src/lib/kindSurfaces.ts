/**
 * What each kind is drawn as, on each surface that draws an event — one ordered
 * table, read by every surface, so the page, its gates and a quote of it cannot
 * drift apart (they did: a kind given a hero kept its thread above, or asked for
 * refs it never drew).
 *
 * Each row is one thing an event can be. On the page (EventScreen) the rows are
 * read in order and the first whose `page.match` holds decides the hero and the
 * gates around it: the conversation above, the replies and tags below, the refs
 * the page asks for, whose name heads it, what follows it. No row matching is
 * the generic page: the event's media, its words, or its structural card.
 *
 * A quote of it (EmbeddedNoteCard, ThingAddressRef, a search row's own card) is
 * drawn by the row whose `embed.kinds` holds its kind — no kind is in two rows'
 * — as the shape `embed.shapeOf` says the event can fill, else as a "note": its
 * words, its kind named. A row's quote kinds need not be its page's: a NIP-85
 * designation has a hero of its own but is quoted as the activity it records.
 *
 * What the kind is called (lib/kindLabel), how its row reads it
 * (lib/resultReaders, lib/resultSummary) and its family (lib/kindFamily) are
 * tables of their own, keyed by kind; kindSurfaces.characterisation.test
 * records every surface's decision for every fixture, these included.
 */
import { CHAT_KINDS } from "@/lib/chatMessage";
import { contentShape } from "@/lib/contentShape";
import { dlistOfEvent } from "@/lib/dlists";
import { hasAudioHero } from "@/lib/audioEvent";
import { ACTIVITY_KINDS } from "@/lib/activity";
import { isBlankEvent } from "@/lib/blankEvent";
import {
  ACTIVITY_EMBED_KINDS,
  APP_EMBED_KINDS,
  ARTICLE_EMBED_KINDS,
  AUDIO_HEADER_KIND,
  CALENDAR_EVENT_KINDS,
  FILE_KIND,
  GIT_STATUS_EMBED_KINDS,
  HIGHLIGHT_KIND,
  LISTING_EMBED_KINDS,
  LIVE_EMBED_KINDS,
  PEOPLE_LIST_KINDS,
  PICTURE_KIND,
  RELEASE_KIND,
  REPO_EMBED_KINDS,
  REPO_STATE_KIND,
  VOICE_KINDS,
  embedAudioUrl,
  embedPictures,
  hasTag,
  namedGitItem,
  taggedVideoUrl,
  type EmbedShape,
} from "@/lib/embedKinds";
import { GIT_STATUS_KIND_SET } from "@/lib/gitEvents";
import { isGitItem } from "@/lib/gitStatus";
import { parseListing } from "@/lib/listing";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { liveTitleOf, readMeeting } from "@/lib/liveStream";
import { mediaKindOf } from "@/lib/mediaKind";
import { VIDEO_KINDS } from "@/lib/nip71";
import { parseHighlight } from "@/lib/nip84";
import type { MinimalEvent } from "@/lib/noteRefs";
import { RELAY_LIST_KIND, relayListEntries } from "@/lib/relayList";
import { readKind } from "@/lib/resultReaders";
import { describeThing, THING_KINDS, type Thing } from "@/lib/thing";
import { parseTrack, TRACK_KINDS } from "@/lib/trackEvent";
import { TRUSTED_LIST_KINDS } from "@/lib/trustedList";
import { USER_STATUS_KIND } from "@/lib/userStatus";
import { webBookmarkOf } from "@/lib/webBookmark";

// Posts read on the note card: notes, reposts, NIP-7D threads (their title as
// the heading), NIP-22 comments (their scope above as the thread) and polls
// (NIP-88 and zap polls, their options and tally under the question).
// Chat messages too — NIP-C7 (9), NIP-28 channel (42), NIP-53 live chat (1311) —
// under the place they were said (ChatContextLine).
export const NOTE_KINDS: ReadonlySet<number> = new Set([1, 6, 11, 16, 1068, 1111, 6969, ...CHAT_KINDS]);

/** The heroes an event's page draws; EventScreen maps each to its component. */
export type EventHeroId =
  | "dlist"
  | "dlist-header"
  | "dictionary-item"
  | "git-item"
  | "live"
  | "meeting"
  | "relay-list"
  | "user-status"
  | "web-bookmark"
  | "app"
  | "file"
  | "repo"
  | "git-status"
  | "repo-state"
  | "git-reply"
  | "release"
  | "follow-set"
  | "trusted-list"
  | "designation"
  | "item-list"
  | "audio"
  | "listing"
  | "calendar"
  | "activity"
  | "thing"
  | "video"
  | "highlight"
  | "note";

/** What the page knows beside the event: `asDictionaryItem` needs the device's Dictionary concepts. */
export interface PageContext {
  asDictionaryItem: boolean;
}

/** What a page draws under its hero, beyond its tags and replies. */
export type PageBelow = "listing-related" | "thing-sections";

export interface KindSurface {
  /** The row's name, for its test. */
  id: string;
  /** The event's page: the hero it is drawn with, and the gates around it. */
  page?: {
    hero: EventHeroId;
    match: (ev: MinimalEvent, ctx: PageContext) => boolean;
    /** The conversation above it: off where the hero draws what the event is about itself. */
    threads?: false;
    /** Its tags and replies below it: off for what someone did — nobody replies to a zap. */
    conversation?: false;
    /** About the thing listed, not who listed it: the lister is a quiet "Listed by" under it. */
    quietAuthor?: true;
    /** The page draws the event's words, so asks for what they quote and mention. */
    collectsRefs?: true;
    below?: PageBelow;
  };
  /** A quote of it: the kinds this row draws, and the shape this event can fill ("note" when none). */
  embed?: {
    kinds: ReadonlySet<number>;
    /** `thing`: the event as lib/thing read it, when the caller already did — it is not read twice. */
    shapeOf: (ev: MinimalEvent, thing?: Thing | null) => EmbedShape;
  };
}

const kinds =
  (...ks: number[]) =>
  (ev: MinimalEvent) =>
    ks.includes(ev.kind);
const inSet = (set: ReadonlySet<number>) => (ev: MinimalEvent) => set.has(ev.kind);
/** A quote that is `shape` when the event can fill it, else its words. */
const when =
  (shape: EmbedShape, fills: (ev: MinimalEvent) => boolean = () => true) =>
  (ev: MinimalEvent): EmbedShape =>
    fills(ev) ? shape : "note";

/** A file (NIP-94) quoted as what it shows, when it shows something. */
function fileShape(ev: MinimalEvent): EmbedShape {
  const media = mediaKindOf(ev);
  if (media === "photo" && embedPictures(ev).length) return "picture";
  if (media === "video" && taggedVideoUrl(ev)) return "video";
  if (media === "audio" && embedAudioUrl(ev)) return "audio";
  return "note";
}

/** In the page's order of precedence: the first row that matches decides. */
export const KIND_SURFACES: readonly KindSurface[] = [
  { id: "dlist", page: { hero: "dlist", match: (ev) => !!dlistOfEvent(ev), quietAuthor: true } },
  // Any other list's header: the list and its items, its tags behind "Advanced view".
  { id: "dlist-header", page: { hero: "dlist-header", match: kinds(39998, 9998), quietAuthor: true } },
  // An item of a Dictionary concept: its concept's own page (ADR 0007), else drawn from its definition (ADR 0004).
  {
    id: "dictionary-item",
    page: { hero: "dictionary-item", match: (_ev, ctx) => ctx.asDictionaryItem, quietAuthor: true },
  },
  { id: "git-item", page: { hero: "git-item", match: (ev) => isGitItem(ev.kind) } },
  {
    id: "live",
    page: { hero: "live", match: kinds(30311) },
    // A card needs a name to say: junk on these kinds would draw "Live event". A space is named
    // by its `room`, a meeting by its `title` (NIP-53), a stream as every surface names it (liveTitleOf).
    embed: { kinds: LIVE_EMBED_KINDS, shapeOf: when("live", (ev) => !!liveTitleOf(ev)) },
  },
  // A NIP-53 space or meeting with a name to say.
  { id: "meeting", page: { hero: "meeting", match: (ev) => readMeeting(ev) !== null } },
  {
    id: "relay-list",
    page: { hero: "relay-list", match: kinds(RELAY_LIST_KIND) },
    embed: { kinds: new Set([RELAY_LIST_KIND]), shapeOf: when("relay-list", (ev) => relayListEntries(ev).length > 0) },
  },
  {
    id: "user-status",
    page: { hero: "user-status", match: kinds(USER_STATUS_KIND) },
    embed: { kinds: new Set([USER_STATUS_KIND]), shapeOf: when("status") },
  },
  // A NIP-B0 bookmark with a page to open.
  { id: "web-bookmark", page: { hero: "web-bookmark", match: (ev) => webBookmarkOf(ev) !== null } },
  {
    id: "app",
    page: { hero: "app", match: kinds(32267) },
    embed: { kinds: APP_EMBED_KINDS, shapeOf: when("app", (ev) => hasTag(ev, "name")) },
  },
  // Any file: an installer offered for download, a picture, video or sound drawn as what it is.
  // Quoted, only a file it can show is drawn as one.
  {
    id: "file",
    page: { hero: "file", match: kinds(1063) },
    embed: { kinds: new Set([FILE_KIND]), shapeOf: fileShape },
  },
  // A repo by its `name`, or by its identifier when it says where to get it; an issue, patch or PR by a title.
  {
    id: "repo",
    page: { hero: "repo", match: kinds(30617) },
    embed: { kinds: REPO_EMBED_KINDS, shapeOf: when("repo", namedGitItem) },
  },
  // A NIP-34 status: what it set, on which issue, patch or PR — drawn by the hero, not above it.
  // Quoted, it always says what it set.
  {
    id: "git-status",
    page: { hero: "git-status", match: inSet(GIT_STATUS_KIND_SET), threads: false },
    embed: { kinds: GIT_STATUS_EMBED_KINDS, shapeOf: when("git-status") },
  },
  // A state needs its repo's `d`; a release, a file or an app to name.
  {
    id: "repo-state",
    page: { hero: "repo-state", match: kinds(30618) },
    embed: { kinds: new Set([REPO_STATE_KIND]), shapeOf: when("repo-state", (ev) => hasTag(ev, "d")) },
  },
  // A reply from before NIP-34 moved replies to NIP-22 comments: its issue or patch is in the hero.
  { id: "git-reply", page: { hero: "git-reply", match: kinds(1622), threads: false } },
  {
    id: "release",
    page: { hero: "release", match: kinds(30063) },
    embed: { kinds: new Set([RELEASE_KIND]), shapeOf: when("release", (ev) => hasTag(ev, "e", "a", "i")) },
  },
  // Quoted, every list of people is its faces — a Trusted People list too. A roster needs
  // someone on it: a private follow set keeps its members in encrypted content.
  {
    id: "follow-set",
    page: { hero: "follow-set", match: kinds(30000, 39089, 39092) },
    embed: {
      kinds: PEOPLE_LIST_KINDS,
      shapeOf: when("people-list", (ev) => ev.tags.some((t) => t[0] === "p" && t[1]?.trim())),
    },
  },
  { id: "trusted-list", page: { hero: "trusted-list", match: inSet(TRUSTED_LIST_KINDS) } },
  { id: "designation", page: { hero: "designation", match: kinds(10040) } },
  // Bookmarks, bookmark sets, curation sets, pins: the things it holds.
  {
    id: "item-list",
    page: { hero: "item-list", match: inSet(ITEM_LIST_KINDS) },
    embed: { kinds: ITEM_LIST_KINDS, shapeOf: when("item-list") },
  },
  // A sound is its own hero only with a file to play: 30054/30055 also carry other apps' records.
  { id: "audio", page: { hero: "audio", match: hasAudioHero } },
  // Quoted, a track or episode that names its audio is its track card; a voice message or an
  // audio header one player row.
  { id: "track", embed: { kinds: TRACK_KINDS, shapeOf: when("track", (ev) => !!parseTrack(ev)) } },
  {
    id: "voice",
    embed: {
      kinds: new Set([...VOICE_KINDS, AUDIO_HEADER_KIND]),
      shapeOf: when("audio", (ev) => !!embedAudioUrl(ev)),
    },
  },
  // Something for sale: a NIP-99 listing, or a NIP-15 product or auction the Shop draws as one.
  {
    id: "listing",
    page: {
      hero: "listing",
      match: (ev) => LISTING_EMBED_KINDS.has(ev.kind) && parseListing(ev) !== null,
      below: "listing-related",
    },
    embed: { kinds: LISTING_EMBED_KINDS, shapeOf: when("listing", (ev) => !!parseListing(ev)) },
  },
  // A dated event needs a name or a date: junk on these kinds would draw a TBA tile.
  {
    id: "calendar",
    page: { hero: "calendar", match: kinds(31922, 31923) },
    embed: {
      kinds: CALENDAR_EVENT_KINDS,
      shapeOf: when("calendar-event", (ev) => hasTag(ev, "title", "name", "start")),
    },
  },
  // Zaps, reactions, deletions, reports, labels, votes, RSVPs, follows, trust scores: its hero
  // is the page, quoting the post it is about — no thread, no tags, no replies of its own.
  {
    id: "activity",
    page: { hero: "activity", match: inSet(ACTIVITY_KINDS), threads: false, conversation: false },
    // Quoted, a designation too, which is its rows: said when its reader has something to say — a title.
    embed: { kinds: ACTIVITY_EMBED_KINDS, shapeOf: when("activity", (ev) => !!readKind(ev)?.title) },
  },
  // Communities, fundraisers, reviews, shops, apps, calendars, badges, emoji packs,
  // playlists, lessons, torrents (lib/thing), with what the network holds around it.
  {
    id: "thing",
    page: { hero: "thing", match: (ev) => describeThing(ev) !== null, below: "thing-sections" },
    embed: {
      kinds: THING_KINDS,
      shapeOf: (ev, thing) => ((thing !== undefined ? thing : describeThing(ev)) ? "thing" : "note"),
    },
  },
  // Quoted, a video that names its file in its words plays from there already (NoteContent).
  {
    id: "video",
    page: { hero: "video", match: inSet(VIDEO_KINDS) },
    embed: { kinds: VIDEO_KINDS, shapeOf: when("video", (ev) => !!taggedVideoUrl(ev)) },
  },
  // A NIP-84 highlight: the passage marked in its paragraph, and the text it is from.
  {
    id: "highlight",
    page: { hero: "highlight", match: (ev) => ev.kind === 9802 && !!ev.content.trim() },
    embed: { kinds: new Set([HIGHLIGHT_KIND]), shapeOf: when("highlight", (ev) => !!parseHighlight(ev)) },
  },
  { id: "note", page: { hero: "note", match: inSet(NOTE_KINDS), collectsRefs: true } },
  // Quoted only — their pages are another layout, or the generic one.
  // Long-form: articles, drafts, publications and their sections, wiki pages, specs, as their teaser.
  { id: "article", embed: { kinds: ARTICLE_EMBED_KINDS, shapeOf: when("article") } },
  // A picture post (kind 20): its pictures.
  {
    id: "picture",
    embed: { kinds: new Set([PICTURE_KIND]), shapeOf: when("picture", (ev) => embedPictures(ev).length > 0) },
  },
];

/** The row each kind is quoted by. */
const EMBED_ROW_OF: ReadonlyMap<number, KindSurface> = new Map(
  KIND_SURFACES.flatMap((row) => [...(row.embed?.kinds ?? [])].map((kind) => [kind, row] as const)),
);

/** What a quote of this event is drawn as. `thing`: the event already read by lib/thing, when the caller has it. */
export function embedShapeOf(ev: MinimalEvent, thing?: Thing | null): EmbedShape {
  // Deleted by overwriting: the note card's quiet stub says so.
  if (isBlankEvent(ev)) return "note";
  return EMBED_ROW_OF.get(ev.kind)?.embed?.shapeOf(ev, thing) ?? "note";
}

/** What an event's page draws, decided once: the hero, and every gate that reads it. */
export interface PageSurface {
  /** The kind's own hero, or null for the generic page. */
  hero: EventHeroId | null;
  /** Drawn by a hero of its own — not the generic page, whose publishing client is worth a way back to. */
  dedicated: boolean;
  /** The generic page with no words to read (none, ciphertext, JSON): the structural card. */
  structural: boolean;
  collectsRefs: boolean;
  threads: boolean;
  conversation: boolean;
  quietAuthor: boolean;
  below: PageBelow | null;
}

/** The hero for an event, in the page's order of precedence. */
export function heroFor(note: MinimalEvent, asDictionaryItem: boolean): EventHeroId | null {
  return pageRowOf(note, { asDictionaryItem })?.page?.hero ?? null;
}

function pageRowOf(note: MinimalEvent, ctx: PageContext): KindSurface | undefined {
  return KIND_SURFACES.find((row) => row.page?.match(note, ctx));
}

/** `hasMedia`: the event carries files of its own (lib/mediaKind), which the generic page draws. */
export function pageSurfaceOf(note: MinimalEvent, ctx: PageContext & { hasMedia: boolean }): PageSurface {
  const page = pageRowOf(note, ctx)?.page;
  if (!page) {
    const structural = !ctx.hasMedia && (!note.content?.trim() || contentShape(note.content).kind !== "text");
    return {
      hero: null,
      dedicated: false,
      structural,
      // The generic page draws the event's words, when it has words to draw.
      collectsRefs: !structural,
      threads: true,
      conversation: true,
      quietAuthor: false,
      below: null,
    };
  }
  return {
    hero: page.hero,
    dedicated: true,
    structural: false,
    collectsRefs: page.collectsRefs ?? false,
    threads: page.threads ?? true,
    conversation: page.conversation ?? true,
    quietAuthor: page.quietAuthor ?? false,
    below: page.below ?? null,
  };
}

/** A post or a highlight is read, so its card has room to breathe. */
export function pageReadsRoomy(note: { kind: number }): boolean {
  return NOTE_KINDS.has(note.kind) || note.kind === 9802;
}
