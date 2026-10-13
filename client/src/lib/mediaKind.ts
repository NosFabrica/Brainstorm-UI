/**
 * What a media hit is — a photo, a video or audio — in one word, so the
 * Media tab can narrow to it (Benjamin, 2026-09-25: "we don't have images as
 * an option or videos"). The URL, the poster and the mime are read here too,
 * lifted out of the media card so the card and the facets agree.
 */
type EventLike = { kind: number; tags: string[][]; content: string };

export type MediaKind = "photo" | "video" | "audio";
export const MEDIA_KIND_ORDER: readonly MediaKind[] = ["photo", "video", "audio"];
export const MEDIA_KIND_LABELS: Record<MediaKind, string> = { photo: "Photos", video: "Videos", audio: "Audio" };

const tagVal = (event: EventLike, name: string): string | undefined => event.tags.find((t) => t[0] === name)?.[1];

// The names lib/noteContent knows a note's pictures and clips by, so a file is the same thing in both.
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i;
const AUDIO_RE = /\.(?:mp3|m4a|ogg|wav|flac|aac|opus)(?:\?|#|$)/i;
const VIDEO_RE = /\.(?:mp4|webm|mov|m4v|m3u8)(?:\?|#|$)/i;
const WEBM_RE = /\.webm(?:\?|#|$)/i;

/** What a bare URL plays as, by its file extension — for a value with no event or mime type around it. */
export function mediaKindOfUrl(url: string): MediaKind | null {
  if (AUDIO_RE.test(url)) return "audio";
  if (VIDEO_RE.test(url)) return "video";
  if (IMAGE_RE.test(url)) return "photo";
  return null;
}

/** The file's URL: imeta first (NIP-92/94), then url/thumb/image tags, then the first picture or clip in the words. */
export function mediaUrlOf(event: EventLike): string | null {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const part = tag.slice(1).find((p) => p.startsWith("url "));
      if (part) return part.slice(4).trim();
    }
  }
  const direct = tagVal(event, "url") ?? tagVal(event, "thumb") ?? tagVal(event, "image");
  if (direct) return direct;
  const inContent = event.content.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp|mp4|webm|mov)\b\S*/i);
  return inContent ? inContent[0] : null;
}

/** The poster IMAGE for a media event — imeta's image/thumb parts (NIP-71
 *  publishes video previews there) or plain thumb/image tags. Null means
 *  "no still exists"; the card then pulls a first frame from the video. */
export function mediaPosterOf(event: EventLike): string | null {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      for (const key of ["image ", "thumb "]) {
        const part = tag.slice(1).find((p) => p.startsWith(key));
        if (part) return part.slice(key.length).trim();
      }
    }
  }
  return tagVal(event, "thumb") ?? tagVal(event, "image") ?? null;
}

/** The declared mime: imeta "m …" first, then the `m` tag. Lower-cased: a mime type is case-insensitive ("Image/JPEG"). */
export function mediaMimeOf(event: EventLike): string {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const m = tag.slice(1).find((p) => p.startsWith("m "));
      if (m) return m.slice(2).trim().toLowerCase();
    }
  }
  return (tagVal(event, "m") ?? "").trim().toLowerCase();
}

/** Video by declared mime first (imeta "m video/…"), extension second. */
export function isVideoUrl(event: EventLike, url: string): boolean {
  const mime = mediaMimeOf(event);
  if (mime) return mime.startsWith("video/");
  return VIDEO_RE.test(url);
}

/** Kinds that are a sound whatever their file is called: NIP-A0 voice messages and replies, audio headers. */
const AUDIO_EVENT_KINDS = new Set([1222, 1244, 1808]);
/** NIP-A0 voice messages and replies: a `.webm` there is a recording, whatever its mime says. */
const VOICE_EVENT_KINDS = new Set([1222, 1244]);

export function mediaKindOf(event: EventLike): MediaKind | null {
  const url = mediaUrlOf(event);
  if (!url) return null;
  const mime = mediaMimeOf(event);
  if (event.kind === 20 || mime.startsWith("image/") || IMAGE_RE.test(url)) return "photo";
  if (AUDIO_EVENT_KINDS.has(event.kind) || mime.startsWith("audio/") || AUDIO_RE.test(url)) return "audio";
  if (isVideoUrl(event, url)) return "video";
  return null;
}

/** One file an event carries, with what its `imeta` says about it (NIP-92/94). */
export interface MediaItem {
  url: string;
  kind: MediaKind;
  mime?: string;
  /** The publisher's description of this one picture, for a reader who cannot see it. */
  alt?: string;
  /** Pixel size from `dim WxH`, when the publisher gave a sane one. */
  dim?: { w: number; h: number };
  /** Seconds, from `duration` — a sound's player shows it without loading the file to ask. */
  durationSec?: number;
  /** A still for a clip, from imeta's `image` (NIP-71) or `thumb`: shown before it plays. */
  poster?: string;
}

const kindOfMime = (raw: string): MediaKind | null => {
  const mime = raw.trim().toLowerCase();
  return mime.startsWith("image/")
    ? "photo"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : null;
};

/** Seconds from a `duration`; past ten hours the number can only be milliseconds (as lib/audioEvent). */
const parseDuration = (raw: string | undefined): number | undefined => {
  const n = Number(raw?.trim() || NaN);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n > 36_000 ? Math.round(n / 1000) : n;
};

const parseDim = (raw: string | undefined): MediaItem["dim"] => {
  const m = raw?.trim().match(/^(\d+)x(\d+)$/);
  const w = m ? Number(m[1]) : 0;
  const h = m ? Number(m[2]) : 0;
  return w > 0 && h > 0 ? { w, h } : undefined;
};

/**
 * Every file an event carries, each with what it plays as: one per `imeta`,
 * then plain `url` tags (a kind-1063 file, its mime in `m`), then — only when
 * there are none — the media links in its words. What a file is comes from its
 * declared mime, then the event's kind when it is a sound (a voice message's
 * `.webm` is not a video), then its extension; a link that says nothing is a
 * picture, as it always was.
 * An audio file is never called a picture: it would draw as a broken image.
 */
export function mediaItemsOf(event: EventLike): MediaItem[] {
  const kindOf = (url: string, mime: string | undefined, sized: boolean, timed: boolean): MediaKind => {
    // A `.webm` holds a sound as often as a clip: in a voice message it is one, whatever its mime
    // says; with a running time and no frame size, it is one too.
    if (WEBM_RE.test(url) && (VOICE_EVENT_KINDS.has(event.kind) || (!mime && timed && !sized))) return "audio";
    return (
      (mime && kindOfMime(mime)) || (AUDIO_EVENT_KINDS.has(event.kind) ? "audio" : (mediaKindOfUrl(url) ?? "photo"))
    );
  };
  const items: MediaItem[] = [];
  const seen = new Set<string>();
  const add = (item: MediaItem) => {
    if (seen.has(item.url)) return;
    seen.add(item.url);
    items.push(item);
  };
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const part = (key: string) =>
        tag
          .slice(1)
          .find((p) => p.startsWith(`${key} `))
          ?.slice(key.length + 1)
          .trim() || undefined;
      const url = part("url");
      if (!url || !/^https?:\/\//i.test(url)) continue;
      const mime = part("m");
      const dim = parseDim(part("dim"));
      const durationSec = parseDuration(part("duration"));
      const poster = part("image") ?? part("thumb");
      add({
        url,
        kind: kindOf(url, mime, !!dim, !!durationSec),
        mime,
        alt: part("alt"),
        dim,
        durationSec,
        poster: poster && /^https?:\/\//i.test(poster) ? poster : undefined,
      });
    } else if (tag[0] === "url" && tag[1] && /^https?:\/\//i.test(tag[1])) {
      const mime = tagVal(event, "m");
      const dim = parseDim(tagVal(event, "dim"));
      const durationSec = parseDuration(tagVal(event, "duration"));
      add({ url: tag[1], kind: kindOf(tag[1], mime, !!dim, !!durationSec), mime, dim, durationSec });
    }
  }
  if (items.length > 0) return items;
  for (const m of event.content.matchAll(/https?:\/\/\S+/gi)) {
    const kind = mediaKindOfUrl(m[0]);
    if (kind) add({ url: m[0], kind });
  }
  return items;
}
