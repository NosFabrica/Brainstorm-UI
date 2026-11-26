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
 *
 * The shape each kind is drawn as is a row of lib/kindSurfaces; the kinds and
 * what each shape needs of the event are lib/embedKinds', re-exported here
 * where their callers have always found them.
 */
export {
  ACTIVITY_EMBED_KINDS,
  ADDRESS_CARD_KINDS,
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
  taggedVideoUrl,
  type EmbedShape,
} from "@/lib/embedKinds";
export { embedShapeOf } from "@/lib/kindSurfaces";

/** Kinds whose words are a note's words: no label above them. */
const NOTE_KINDS: ReadonlySet<number> = new Set([1, 11, 1111]);

/** Whether a quote drawn as words names its kind — a quoted zap or reaction is not a mystery. */
export function namesItsKind(kind: number): boolean {
  return !NOTE_KINDS.has(kind);
}
