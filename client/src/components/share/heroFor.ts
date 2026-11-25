/**
 * Which hero an event's page (EventScreen) draws it with, decided once: the
 * chain in EventScreen's JSX switches on this, and everything that asks "is
 * this drawn by a hero of its own?" (the "Open in" origin client, the refs the
 * page asks for, the thread above it) reads the same answer, so they cannot
 * drift apart. `null` is the generic fallback: the media, the text, or the
 * structural card.
 */
import { CHAT_KINDS } from "@/lib/chatMessage";
import { dlistOfEvent } from "@/lib/dlists";
import { hasAudioHero } from "@/lib/audioEvent";
import { GIT_STATUS_KIND_SET } from "@/lib/gitEvents";
import { isGitItem } from "@/lib/gitStatus";
import { LISTING_EMBED_KINDS } from "@/lib/embedShape";
import { parseListing } from "@/lib/listing";
import { ITEM_LIST_KINDS } from "@/lib/listItems";
import { readMeeting } from "@/lib/liveStream";
import { VIDEO_KINDS } from "@/lib/nip71";
import type { MinimalEvent } from "@/lib/noteRefs";
import { RELAY_LIST_KIND } from "@/lib/relayList";
import { TRUSTED_LIST_KINDS } from "@/lib/trustedList";
import { USER_STATUS_KIND } from "@/lib/userStatus";
import { webBookmarkOf } from "@/lib/webBookmark";
import { hasActivityHero } from "@/components/share/activity";
import { hasThingPage } from "@/components/share/things";

// Posts read on the note card: notes, reposts, NIP-7D threads (their title as
// the heading), NIP-22 comments (their scope above as the thread) and polls
// (NIP-88 and zap polls, their options and tally under the question).
// Chat messages too — NIP-C7 (9), NIP-28 channel (42), NIP-53 live chat (1311) —
// under the place they were said (ChatContextLine).
export const NOTE_KINDS: ReadonlySet<number> = new Set([1, 6, 11, 16, 1068, 1111, 6969, ...CHAT_KINDS]);

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

/**
 * The hero for an event, in the page's order of precedence. `asDictionaryItem`
 * is the page's own reading (it needs the device's Dictionary concepts).
 */
export function heroFor(note: MinimalEvent, asDictionaryItem: boolean): EventHeroId | null {
  if (dlistOfEvent(note)) return "dlist";
  if (note.kind === 39998 || note.kind === 9998) return "dlist-header";
  if (asDictionaryItem) return "dictionary-item";
  if (isGitItem(note.kind)) return "git-item";
  if (note.kind === 30311) return "live";
  // A NIP-53 space or meeting with a name to say.
  if (readMeeting(note) !== null) return "meeting";
  if (note.kind === RELAY_LIST_KIND) return "relay-list";
  if (note.kind === USER_STATUS_KIND) return "user-status";
  // A NIP-B0 bookmark with a page to open.
  if (webBookmarkOf(note) !== null) return "web-bookmark";
  if (note.kind === 32267) return "app";
  if (note.kind === 1063) return "file";
  if (note.kind === 30617) return "repo";
  if (GIT_STATUS_KIND_SET.has(note.kind)) return "git-status";
  if (note.kind === 30618) return "repo-state";
  if (note.kind === 1622) return "git-reply";
  if (note.kind === 30063) return "release";
  if (note.kind === 30000 || note.kind === 39089 || note.kind === 39092) return "follow-set";
  if (TRUSTED_LIST_KINDS.has(note.kind)) return "trusted-list";
  if (note.kind === 10040) return "designation";
  if (ITEM_LIST_KINDS.has(note.kind)) return "item-list";
  // A sound is its own hero only with a file to play: 30054/30055 also carry other apps' records.
  if (hasAudioHero(note)) return "audio";
  // Something for sale: a NIP-99 listing, or a NIP-15 product or auction the Shop draws as one.
  if (LISTING_EMBED_KINDS.has(note.kind) && parseListing(note) !== null) return "listing";
  if (note.kind === 31922 || note.kind === 31923) return "calendar";
  if (hasActivityHero(note)) return "activity";
  if (hasThingPage(note)) return "thing";
  if (VIDEO_KINDS.has(note.kind)) return "video";
  if (note.kind === 9802 && note.content.trim()) return "highlight";
  if (NOTE_KINDS.has(note.kind)) return "note";
  return null;
}
