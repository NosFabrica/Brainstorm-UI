import { useEffect, useRef, useState } from "react";
import { Music as MusicIcon, Mic, Podcast, Play, Pause, Loader2, AlertCircle } from "lucide-react";
import { useTrackPlayer, useTrackDuration, toggleTrack, seekTrack, formatTime } from "@/lib/audioPlayer";
import { readAudioEvent, releasedLabel, type AudioEventShape } from "@/lib/audioEvent";
import audioDefault from "@/assets/audio-default.webp";
import type { MinimalEvent } from "@/lib/noteRefs";
import { ReadingText } from "@/components/share/ReadingText";
import { Chip } from "@/components/ui/chip";
import { EmojiText } from "@/components/ui/custom-emoji";
import { SensitiveTile } from "@/components/share/SensitiveMedia";
import { contentWarningOf } from "@/lib/nip36";

const SHAPE_ICON: Record<AudioEventShape, typeof MusicIcon> = {
  track: MusicIcon,
  episode: Podcast,
  trailer: Podcast,
  voice: Mic,
  audio: MusicIcon,
};

/**
 * The "now playing" hero for a sound on its /e page — a music track (31337,
 * 36787), a podcast episode or trailer (54, 30054, 30055), a voice message
 * (1222, 1244) or an audio header (1808), read by lib/audioEvent: large cover
 * art, title + artist, a full-width player (big play/pause, seek bar,
 * elapsed/total time), the facts its kind carries (album, track, release,
 * season, episode, explicit) and its description or caption. Reuses the
 * shared audio player, so it's the same one-at-a-time playback that pauses on
 * navigation.
 *
 * Art its creator marked sensitive (NIP-36) is a placeholder until the reader
 * asks — and the player bar is not handed it before then.
 */
export function AudioHero({ event }: { event: MinimalEvent }) {
  const id = event.id;
  const a = readAudioEvent(event);
  const { title, artist, audio, genres, durationSec, text: description } = a;
  const warning = contentWarningOf(event);
  // Kept per event, so a reveal never carries to the next sound the page shows.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const coverHidden = !!warning && !!a.cover && shownFor !== id;
  const cover = coverHidden ? undefined : a.cover;
  const coverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shownFor === id) coverRef.current?.focus();
  }, [shownFor, id]);
  const Icon = SHAPE_ICON[a.shape];
  const facts = [
    a.album,
    a.trackNumber ? `Track ${a.trackNumber}` : "",
    a.season ? `Season ${a.season}` : "",
    a.episode ? `Episode ${a.episode}` : "",
    a.released ? `Released ${releasedLabel(a.released)}` : "",
  ].filter(Boolean);

  const player = useTrackPlayer(id);
  const metaDuration = useTrackDuration(durationSec ? undefined : audio);
  const total = player.isActive && player.duration ? player.duration : (durationSec ?? metaDuration ?? 0);
  const pct = total > 0 ? (player.currentTime / total) * 100 : 0;
  const playable = !!audio;

  return (
    <div data-testid="audio-hero">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        {/* Cover */}
        <div
          ref={coverRef}
          tabIndex={shownFor === id ? -1 : undefined}
          className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-brand-deep/10 focus:outline-none dark:border-slate-800 sm:h-44 sm:w-44"
          data-testid="audio-hero-cover"
        >
          {coverHidden ? (
            <button
              type="button"
              onClick={() => setShownFor(id)}
              className="h-full w-full"
              aria-label={warning?.reason ? `Show sensitive cover: ${warning.reason}` : "Show sensitive cover"}
            >
              <SensitiveTile className="h-full w-full" />
            </button>
          ) : (
            <img
              src={cover || audioDefault}
              alt=""
              loading="lazy"
              onError={(e) => {
                if (!e.currentTarget.src.includes("audio-default")) e.currentTarget.src = audioDefault;
              }}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        {/* Title, artist, genre, player */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-brand-link">
            <Icon className="h-3 w-3" /> {a.label}
          </span>
          <h1
            className="mt-1 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <EmojiText text={title} tags={event} />
          </h1>
          {artist && (
            <p
              className="mt-0.5 text-sm font-medium text-slate-500 dark:text-slate-400"
              data-testid="audio-hero-artist"
            >
              <EmojiText text={artist} tags={event} />
            </p>
          )}
          {facts.length > 0 && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400" data-testid="audio-hero-facts">
              {facts.join(" · ")}
            </p>
          )}

          {(a.explicit || genres.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.explicit && (
                <Chip tone="slate" size="sm" data-testid="audio-hero-explicit">
                  Explicit
                </Chip>
              )}
              {genres.map((g) => (
                <Chip key={g} tone="slate" size="sm">
                  {g}
                </Chip>
              ))}
            </div>
          )}

          {/* Full-width player */}
          <div className="mt-auto flex items-center gap-3 pt-4">
            <button
              type="button"
              disabled={!playable}
              onClick={() => {
                if (audio) toggleTrack(id, audio, { title, artist, cover });
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary text-white shadow-sm transition-colors hover:bg-brand-primary-hover disabled:opacity-40"
              aria-label={player.isPlaying ? "Pause" : "Play"}
              data-testid="audio-hero-play"
            >
              {player.isError ? (
                <AlertCircle className="h-5 w-5" />
              ) : player.isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : player.isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 translate-x-[1px] fill-current" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(pct)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seekTrack(id, (e.clientX - r.left) / r.width);
                }}
                className="group relative h-1.5 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700"
              >
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
                <div
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary opacity-0 shadow transition-opacity group-hover:opacity-100"
                  style={{ left: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
                <span>{player.isError ? "Couldn't play this" : formatTime(player.currentTime)}</span>
                <span data-testid="audio-hero-duration">{formatTime(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {description && description !== title && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/60">
          <ReadingText text={description} tags={event.tags} />
        </div>
      )}
    </div>
  );
}
