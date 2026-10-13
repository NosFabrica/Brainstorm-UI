/**
 * A sound on its own page: what the event page's audio hero reads from each
 * audio kind, so a track, an episode and a voice message share one player.
 *
 * - 31337 / 36787 music track: `title`, `artist`, `image`, `url`, `duration`;
 *   36787 adds `album`, `track_number`, `released` (ISO date), `explicit`.
 * - 54 podcast episode (NIP-F4): `title`, `image`, `description`, `audio url mime`.
 * - 30054 Podcasting 2.0 episode: as 54, plus `episode`, `season`, `duration`.
 * - 30055 Podcasting 2.0 trailer: `title`, `url`, `season`; the content repeats the title.
 * - 1222 / 1244 voice message and reply (NIP-A0): the file in `imeta`
 *   (`url`, `m`, `duration`); the content is the file's URL, words beside it a caption.
 * - 1808 audio header: `stream_url`, `download_url` or `url`; the content describes it.
 *
 * 30054 and 30055 are also written by apps that are not podcasts (reading
 * progress, probed 2026-09-29): without a file to play they are not a sound,
 * and the page draws them as it would any other event.
 */
type EventLike = { kind: number; tags: string[][]; content: string };

export type AudioEventShape = "track" | "episode" | "trailer" | "voice" | "audio";

export interface AudioEvent {
  shape: AudioEventShape;
  /** The hero's kicker: "Track", "Episode", "Voice message"… */
  label: string;
  title: string;
  artist?: string;
  cover?: string;
  audio?: string;
  durationSec?: number;
  /** The description under the player: a summary, a show's notes, a voice message's caption. */
  text?: string;
  album?: string;
  trackNumber?: string;
  /** As published (an ISO date for 36787); the hero formats it. */
  released?: string;
  explicit: boolean;
  season?: string;
  episode?: string;
  genres: string[];
}

const MUSIC_KINDS = new Set([31337, 36787]);
const EPISODE_KINDS = new Set([54, 30054]);
const VOICE_KINDS = new Set([1222, 1244]);
/** Every kind the audio hero can draw. */
export const AUDIO_HERO_KINDS = new Set([...MUSIC_KINDS, ...EPISODE_KINDS, 30055, ...VOICE_KINDS, 1808]);

const isHttp = (s: string | undefined): s is string => !!s && /^https?:\/\//i.test(s);

function imetaPart(ev: EventLike, key: string): string | undefined {
  for (const t of ev.tags) {
    if (t[0] !== "imeta") continue;
    const part = t.slice(1).find((p) => p.startsWith(`${key} `));
    if (part) return part.slice(key.length + 1).trim() || undefined;
  }
  return undefined;
}

/**
 * A file named as audio by its extension (what lib/audioPlayer reads too, `.webm` among them).
 * `.mpga` is what Blossom servers name an `audio/mpeg` upload (podcast episodes and trailers, probed 2026-10-13).
 */
const AUDIO_EXT = /\.(?:mp3|mpga|wav|m4a|aac|ogg|oga|opus|flac|webm)(?:\?|#|$)/i;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:\?|#|$)/i;
/** Kinds that are a sound whatever their file is called: voice messages and replies, audio headers. */
const SOUND_KINDS = new Set([1222, 1244, 1808]);

const isMime = (s: string | undefined): s is string => !!s && /^[a-z]+\/[\w.+-]+/i.test(s.trim());

/**
 * Whether a named file is a sound: its declared mime says audio, or its name
 * does. A voice message or an audio header is one unless its mime or name says
 * it is a picture or a video. Anything else — a reading app's page link on a
 * 30054, a picture in a voice message's imeta — is nothing to play.
 */
function isAudioFile(kind: number, url: string, mime: string | undefined): boolean {
  const m = mime?.trim().toLowerCase() ?? "";
  if (m.startsWith("audio/")) return true;
  if (m.startsWith("image/") || m.startsWith("video/")) return false;
  if (AUDIO_EXT.test(url)) return true;
  return SOUND_KINDS.has(kind) && !IMAGE_EXT.test(url);
}

/**
 * The files an event names, in the order the players read them, each with
 * the mime said beside it: an audio header's stream before its download, the
 * media tags (an `audio` tag's third value is its mime, NIP-F4), each imeta,
 * any tag value named as audio, then an audio link in the words — or, for a
 * voice message, the URL its content is.
 */
function audioCandidates(ev: EventLike): { url: string; mime?: string }[] {
  const out: { url: string; mime?: string }[] = [];
  // `m` (NIP-94), or `type` beside a 30055 trailer's `url` (Podcasting 2.0's enclosure type).
  const eventMime = ev.tags.find((t) => (t[0] === "m" || t[0] === "type") && isMime(t[1]))?.[1];
  const push = (url: string | undefined, mime?: string) => {
    const u = url?.trim();
    if (isHttp(u)) out.push({ url: u, mime });
  };
  if (ev.kind === 1808) for (const key of ["stream_url", "download_url"]) push(ev.tags.find((t) => t[0] === key)?.[1]);
  for (const key of ["media", "url", "stream", "streaming", "enclosure", "audio"])
    for (const t of ev.tags) if (t[0] === key) push(t[1], isMime(t[2]) ? t[2] : eventMime);
  for (const t of ev.tags) {
    if (t[0] !== "imeta") continue;
    const part = (k: string) =>
      t
        .slice(1)
        .find((p) => p.startsWith(`${k} `))
        ?.slice(k.length + 1)
        .trim();
    push(part("url"), part("m"));
  }
  for (const t of ev.tags) for (const v of t.slice(1)) if (AUDIO_EXT.test(v ?? "")) push(v);
  for (const u of (ev.content || "").match(/https?:\/\/\S+/g) ?? []) if (AUDIO_EXT.test(u)) push(u);
  const content = (ev.content || "").trim();
  if (VOICE_KINDS.has(ev.kind) && /^https?:\/\/\S+$/i.test(content)) push(content);
  return out;
}

/** The file to play: the first one the event names that is a sound (an audio header's stream before its download). */
export function audioOf(ev: EventLike): string | undefined {
  return audioCandidates(ev).find((c) => isAudioFile(ev.kind, c.url, c.mime))?.url;
}

/**
 * Whether the page draws this event as a sound: an audio kind with an audio file to play.
 * A 31337 too — the kind also carries game state and AntennaPod ad-skip data
 * (lib/trackEvent), which an empty "Untitled track" player only misnames.
 */
export function hasAudioHero(ev: EventLike): boolean {
  return AUDIO_HERO_KINDS.has(ev.kind) && !!audioOf(ev);
}

/**
 * "2024-03-01" as a reader says it, on the day the publisher wrote; a year, a
 * month, a day that does not exist ("2024-02-30", which Date.parse rolls over
 * to 1 March) or anything else as published.
 */
export function releasedLabel(raw: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
  if (!day) return raw;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) return raw;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const LABELS: Record<AudioEventShape, string> = {
  track: "Track",
  episode: "Episode",
  trailer: "Trailer",
  voice: "Voice message",
  audio: "Audio",
};

export function readAudioEvent(ev: EventLike): AudioEvent {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const shape: AudioEventShape = MUSIC_KINDS.has(ev.kind)
    ? "track"
    : EPISODE_KINDS.has(ev.kind)
      ? "episode"
      : ev.kind === 30055
        ? "trailer"
        : VOICE_KINDS.has(ev.kind)
          ? "voice"
          : "audio";
  const audio = audioOf(ev);
  // Publishers disagree on the unit: most write seconds, some milliseconds.
  // No song runs ten hours, so past that the number can only be milliseconds (as lib/trackEvent).
  const raw = Number(tag("duration") ?? imetaPart(ev, "duration"));
  const dur = raw > 36_000 ? Math.round(raw / 1000) : raw;
  // A voice message's content is its file's URL; only the words around it are a caption —
  // never a link, the file's or another (a query string, a second file, a page).
  const content = (shape === "voice" ? ev.content.replace(/https?:\/\/\S+/gi, " ") : ev.content)
    .replace(/[^\S\n]+/g, " ")
    .trim();
  const title =
    tag("title") ||
    tag("subject") ||
    (shape === "voice"
      ? ev.kind === 1244
        ? "Voice reply"
        : "Voice message"
      : shape === "audio"
        ? "Audio"
        : shape === "trailer" && content
          ? content
          : "Untitled track");
  const described = tag("summary") || tag("description");
  const text = (described || content || "").trim();
  return {
    shape,
    label: LABELS[shape],
    title,
    // `c` is a category on older 31337 records, read here as before.
    artist: tag("artist") || tag("creator") || (ev.kind === 31337 ? tag("c") : undefined),
    cover: tag("image") || tag("cover") || imetaPart(ev, "image") || imetaPart(ev, "thumb"),
    audio,
    durationSec: Number.isFinite(dur) && dur > 0 ? dur : undefined,
    text: text && text !== title ? text : undefined,
    album: tag("album"),
    trackNumber: tag("track_number"),
    released: tag("released"),
    explicit: tag("explicit")?.toLowerCase() === "true",
    season: tag("season"),
    episode: tag("episode"),
    // Each genre once, however its cases were published: "rock" and "Rock" are one chip (and one React key).
    genres: [
      ...new Map(
        ev.tags
          .filter((t) => t[0] === "t" && t[1]?.trim())
          .map((t) => t[1].trim())
          .filter((g) => g.toLowerCase() !== "music")
          .map((g) => [g.toLowerCase(), g.charAt(0).toUpperCase() + g.slice(1)] as const),
      ).values(),
    ],
  };
}
