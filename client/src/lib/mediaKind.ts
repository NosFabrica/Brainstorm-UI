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

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;
const AUDIO_RE = /\.(?:mp3|m4a|ogg|wav|flac|aac|opus)(?:\?|#|$)/i;
const VIDEO_RE = /\.(?:mp4|webm|mov|m3u8)(?:\?|#|$)/i;

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

/** The declared mime: imeta "m …" first, then the `m` tag. */
export function mediaMimeOf(event: EventLike): string {
  for (const tag of event.tags) {
    if (tag[0] === "imeta") {
      const m = tag.slice(1).find((p) => p.startsWith("m "));
      if (m) return m.slice(2).trim();
    }
  }
  return tagVal(event, "m") ?? "";
}

/** Video by declared mime first (imeta "m video/…"), extension second. */
export function isVideoUrl(event: EventLike, url: string): boolean {
  const mime = mediaMimeOf(event);
  if (mime) return mime.startsWith("video/");
  return VIDEO_RE.test(url);
}

export function mediaKindOf(event: EventLike): MediaKind | null {
  const url = mediaUrlOf(event);
  if (!url) return null;
  const mime = mediaMimeOf(event);
  if (event.kind === 20 || mime.startsWith("image/") || IMAGE_RE.test(url)) return "photo";
  if (event.kind === 1222 || mime.startsWith("audio/") || AUDIO_RE.test(url)) return "audio";
  if (isVideoUrl(event, url)) return "video";
  return null;
}
