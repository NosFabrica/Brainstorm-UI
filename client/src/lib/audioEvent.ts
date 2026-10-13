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
import { audioUrlFromEvent } from "@/lib/audioPlayer";

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

/** The file to play: an audio header names its stream before its download; everything else as the players read it. */
export function audioOf(ev: EventLike): string | undefined {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim();
  if (ev.kind === 1808) {
    const named = [tag("stream_url"), tag("download_url")].find(isHttp);
    if (named) return named;
  }
  return audioUrlFromEvent(ev);
}

/** Whether the page draws this event as a sound: an audio kind with a file to play (a 31337 always, as before). */
export function hasAudioHero(ev: EventLike): boolean {
  if (!AUDIO_HERO_KINDS.has(ev.kind)) return false;
  return ev.kind === 31337 || !!audioOf(ev);
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
  // A voice message's content is its file's URL; only the words around it are a caption.
  const content = (shape === "voice" && audio ? ev.content.split(audio).join(" ") : ev.content)
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
    genres: ev.tags
      .filter((t) => t[0] === "t" && t[1])
      .map((t) => t[1])
      .filter((g) => g.toLowerCase() !== "music")
      .map((g) => g.charAt(0).toUpperCase() + g.slice(1)),
  };
}
