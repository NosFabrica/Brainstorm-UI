/**
 * A native Nostr track — kind 31337 as Wavlake, Stemstr and Tunestr publish
 * it — read for a listener: title, artist, cover, the audio to play.
 *
 * The kind is also abused: live probing (2026-09-04) found the newest 31337s
 * to be game state, AntennaPod ad-skip data and encrypted blobs, none with a
 * title or a media tag. So a track is only a track when it has a title and
 * something to play; everything else is not a song and does not render.
 */
import { audioUrlFromEvent } from "@/lib/audioPlayer";

export interface Track {
  id: string;
  pubkey: string;
  title: string;
  /** Flash's own field when present; callers fall back to the author's name. */
  artist?: string;
  cover?: string;
  audio: string;
  genre?: string;
  /** Seconds, when the publisher said. */
  durationSec?: number;
  createdAt: number;
}

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; tags: string[][]; content: string };

export const TRACK_KIND = 31337;

export function parseTrack(ev: EventLike): Track | null {
  if (ev.kind !== TRACK_KIND) return null;
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || undefined;
  const title = tag("title") || tag("subject");
  const audio = audioUrlFromEvent(ev);
  if (!title || !audio) return null;
  // Publishers disagree on the unit: most write seconds, some milliseconds.
  // No song runs ten hours, so past that the number can only be milliseconds.
  const raw = Number(tag("duration"));
  const dur = raw > 36_000 ? Math.round(raw / 1000) : raw;
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    title,
    // `c` is a CATEGORY on older records (Podcast, Rock, Pop) — a genre, never
    // the artist; the row falls back to the author's name.
    artist: tag("artist") || tag("creator"),
    cover: tag("image") || tag("cover"),
    audio,
    genre: tag("genre") || ev.tags.find((t) => t[0] === "t" && t[1])?.[1] || tag("c"),
    durationSec: Number.isFinite(dur) && dur > 0 ? dur : undefined,
    createdAt: ev.created_at,
  };
}

const QA_TAGS = new Set(["fanfares-qa", "test", "qa"]);
const QA_WORDS = /\b(?:qa|test|tests|fixture)\b/i;

/**
 * Not a song: a QA or test publication. Browse led with "QA storage fixture
 * qa41" (Fanfares' QA bot, `t fanfares-qa`) and "Test Blossom" by "test"
 * (probed 2026-09-04). A track is one when it is tagged as QA/test, or when its
 * title and artist both read as a test — "Testify" by a real artist is a song.
 */
export function isTestTrack(ev: EventLike): boolean {
  const tag = (k: string) => ev.tags.find((t) => t[0] === k)?.[1]?.trim() || "";
  if (ev.tags.some((t) => t[0] === "t" && QA_TAGS.has((t[1] ?? "").toLowerCase()))) return true;
  const title = tag("title") || tag("subject");
  const artist = tag("artist") || tag("creator") || tag("c");
  const artistIsTest = /^(?:test|qa|ff-qa-creator|fanfares-qa)\b/i.test(artist);
  return artistIsTest && (QA_WORDS.test(title) || title === "");
}
