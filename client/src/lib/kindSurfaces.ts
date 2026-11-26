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
import { GIT_STATUS_KIND_SET } from "@/lib/gitEvents";
import { isGitItem } from "@/lib/gitStatus";
import { LISTING_EMBED_KINDS } from "@/lib/embedShape";
import { parseListing } from "@/lib/listing";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { readMeeting } from "@/lib/liveStream";
import { VIDEO_KINDS } from "@/lib/nip71";
import type { MinimalEvent } from "@/lib/noteRefs";
import { RELAY_LIST_KIND } from "@/lib/relayList";
import { describeThing } from "@/lib/thing";
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
}

const kinds =
  (...ks: number[]) =>
  (ev: MinimalEvent) =>
    ks.includes(ev.kind);
const inSet = (set: ReadonlySet<number>) => (ev: MinimalEvent) => set.has(ev.kind);

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
  { id: "live", page: { hero: "live", match: kinds(30311) } },
  // A NIP-53 space or meeting with a name to say.
  { id: "meeting", page: { hero: "meeting", match: (ev) => readMeeting(ev) !== null } },
  { id: "relay-list", page: { hero: "relay-list", match: kinds(RELAY_LIST_KIND) } },
  { id: "user-status", page: { hero: "user-status", match: kinds(USER_STATUS_KIND) } },
  // A NIP-B0 bookmark with a page to open.
  { id: "web-bookmark", page: { hero: "web-bookmark", match: (ev) => webBookmarkOf(ev) !== null } },
  { id: "app", page: { hero: "app", match: kinds(32267) } },
  // Any file: an installer offered for download, a picture, video or sound drawn as what it is.
  { id: "file", page: { hero: "file", match: kinds(1063) } },
  { id: "repo", page: { hero: "repo", match: kinds(30617) } },
  // A NIP-34 status: what it set, on which issue, patch or PR — drawn by the hero, not above it.
  { id: "git-status", page: { hero: "git-status", match: inSet(GIT_STATUS_KIND_SET), threads: false } },
  { id: "repo-state", page: { hero: "repo-state", match: kinds(30618) } },
  // A reply from before NIP-34 moved replies to NIP-22 comments: its issue or patch is in the hero.
  { id: "git-reply", page: { hero: "git-reply", match: kinds(1622), threads: false } },
  { id: "release", page: { hero: "release", match: kinds(30063) } },
  { id: "follow-set", page: { hero: "follow-set", match: kinds(30000, 39089, 39092) } },
  { id: "trusted-list", page: { hero: "trusted-list", match: inSet(TRUSTED_LIST_KINDS) } },
  { id: "designation", page: { hero: "designation", match: kinds(10040) } },
  // Bookmarks, bookmark sets, curation sets, pins: the things it holds.
  { id: "item-list", page: { hero: "item-list", match: inSet(ITEM_LIST_KINDS) } },
  // A sound is its own hero only with a file to play: 30054/30055 also carry other apps' records.
  { id: "audio", page: { hero: "audio", match: hasAudioHero } },
  // Something for sale: a NIP-99 listing, or a NIP-15 product or auction the Shop draws as one.
  {
    id: "listing",
    page: {
      hero: "listing",
      match: (ev) => LISTING_EMBED_KINDS.has(ev.kind) && parseListing(ev) !== null,
      below: "listing-related",
    },
  },
  { id: "calendar", page: { hero: "calendar", match: kinds(31922, 31923) } },
  // Zaps, reactions, deletions, reports, labels, votes, RSVPs, follows, trust scores: its hero
  // is the page, quoting the post it is about — no thread, no tags, no replies of its own.
  {
    id: "activity",
    page: { hero: "activity", match: inSet(ACTIVITY_KINDS), threads: false, conversation: false },
  },
  // Communities, fundraisers, reviews, shops, apps, calendars, badges, emoji packs,
  // playlists, lessons, torrents (lib/thing), with what the network holds around it.
  { id: "thing", page: { hero: "thing", match: (ev) => describeThing(ev) !== null, below: "thing-sections" } },
  { id: "video", page: { hero: "video", match: inSet(VIDEO_KINDS) } },
  // A NIP-84 highlight: the passage marked in its paragraph, and the text it is from.
  { id: "highlight", page: { hero: "highlight", match: (ev) => ev.kind === 9802 && !!ev.content.trim() } },
  { id: "note", page: { hero: "note", match: inSet(NOTE_KINDS), collectsRefs: true } },
];

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
