import { type MouseEvent } from "react";
import { useLocation } from "wouter";
import { Play, Pause, Loader2, AlertCircle } from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";
import { useTrackPlayer, useTrackDuration, toggleTrack, seekTrack, formatTime } from "@/lib/audioPlayer";
import audioDefault from "@/assets/audio-default.webp";

/**
 * The "now playing" equalizer — bars bounce while playing, freeze on pause.
 * It lives on the cover art, Spotify's playing mark, in white over the dark wash.
 */
export function Equalizer({ playing, className = "h-3.5 w-3.5", bar = "bg-brand-primary" }: { playing: boolean; className?: string; bar?: string }) {
  return (
    <span className={`flex shrink-0 items-end gap-[2px] ${className}`} aria-hidden="true" data-testid="track-eq">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-[3px] flex-1 origin-bottom rounded-full ${bar} ${playing ? "eq-bar" : ""}`}
          style={{ height: "100%", animationDelay: `${i * 0.18}s`, ...(playing ? {} : { transform: "scaleY(0.4)" }) }}
        />
      ))}
    </span>
  );
}

/**
 * A music-track row for the public page. The cover doubles as an enterprise
 * play/pause button; the title/artist open the /e event page; and the active
 * track reveals a slim brand progress bar (click-to-seek) with elapsed/total
 * time. Spotify touches: artist subtitle + total duration on every row, a genre
 * chip + zap action on the active/hovered row, and an animated equalizer +
 * brand-coloured title while playing. Falls back to a plain link with no audio.
 */
export function EmbeddedTrackCard({
  id,
  title,
  artist,
  cover,
  audio,
  genre,
  href,
  onZap,
  sourceLabel,
  onOpen,
  pageUrl,
  flat = false,
  durationSec,
}: {
  id: string;
  title: string;
  artist?: string;
  cover?: string;
  audio?: string;
  genre?: string;
  href?: string;
  onZap?: () => void;
  /** Small provider tag shown in the rail (e.g. "Wavlake"). */
  sourceLabel?: string;
  /** Overrides the internal /e navigation for the row-open (e.g. open externally). */
  onOpen?: () => void;
  /** The track's page on its source site, for the app's now-playing bar to link. */
  pageUrl?: string;
  /** No frame of its own — a row in a list that draws hairlines between rows. */
  flat?: boolean;
  /** Known total duration (skips the metadata probe when provided). */
  durationSec?: number;
}) {
  const [, navigate] = useLocation();
  const player = useTrackPlayer(id);
  const metaDuration = useTrackDuration(durationSec ? undefined : audio);
  const playable = !!audio;

  const open = onOpen ?? (href ? () => navigate(href) : undefined);
  const onRowClick = open
    ? (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest("a, button, [data-noopen]")) return;
        open();
      }
    : undefined;

  const total = player.isActive && player.duration ? player.duration : durationSec ?? metaDuration ?? 0;
  const pct = total > 0 ? (player.currentTime / total) * 100 : 0;
  // Active controls are always shown; idle controls reveal on hover.
  const revealCls = player.isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100";

  return (
    <div
      onClick={onRowClick}
      className={
        flat
          ? `group flex items-center gap-3 rounded-lg px-1 py-2 transition-colors ${player.isActive ? "bg-brand-link/[0.04]" : ""} ${
              href ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60" : ""
            }`
          : `group flex items-center gap-3 rounded-xl border bg-white dark:bg-slate-900 p-2.5 transition-colors ${
              player.isActive ? "border-brand-link/30 ring-1 ring-brand-link/10" : "border-slate-200 dark:border-slate-800"
            } ${href ? "cursor-pointer hover:border-slate-300 dark:hover:border-slate-700" : ""}`
      }
      data-testid="embedded-track"
    >
      {/* Cover = play / pause control */}
      <button
        type="button"
        disabled={!playable}
        onClick={(e) => { e.stopPropagation(); if (audio) toggleTrack(id, audio, { title, artist, cover, href: href ?? pageUrl }); }}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg group/cover disabled:cursor-default"
        aria-label={player.isPlaying ? "Pause" : "Play"}
        data-testid="track-play"
      >
        <img
          src={cover || audioDefault}
          alt=""
          loading="lazy"
          onError={(e) => { if (!e.currentTarget.src.includes("audio-default")) e.currentTarget.src = audioDefault; }}
          className="h-full w-full bg-brand-deep/10 object-cover"
        />
        {playable && (
          <span className={`absolute inset-0 flex items-center justify-center transition-colors ${player.isActive ? "bg-black/45" : "bg-black/25 group-hover/cover:bg-black/40"}`}>
            {/* The active track's mark is the moving bars on its art; the
                control comes back under the pointer. Idle covers offer Play. */}
            {player.isActive && !player.isLoading && !player.isError && (
              <Equalizer playing={player.isPlaying} className="h-5 w-5 group-hover/cover:hidden" bar="bg-white" />
            )}
            <span
              className={`h-7 w-7 items-center justify-center rounded-full bg-white text-brand-link shadow-md ring-1 ring-black/5 transition-transform group-hover/cover:scale-105 ${
                player.isActive && !player.isLoading && !player.isError ? "hidden group-hover/cover:flex" : "flex"
              }`}
            >
              {player.isError ? (
                <AlertCircle className="h-4 w-4 text-red-500" />
              ) : player.isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : player.isPlaying ? (
                <Pause className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Play className="h-3.5 w-3.5 translate-x-[1px] fill-current" />
              )}
            </span>
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${player.isActive ? "text-brand-link" : "text-slate-900 dark:text-slate-100"}`}>{title}</p>
        {artist && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{artist}</p>}

        {player.isActive && (
          <div className="mt-2 flex items-center gap-2" data-noopen>
            <div
              role="slider"
              aria-label="Seek"
              aria-valuenow={Math.round(pct)}
              onClick={(e) => {
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                seekTrack(id, (e.clientX - r.left) / r.width);
              }}
              className="group/bar relative h-1.5 flex-1 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700"
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full bg-brand-primary opacity-0 shadow transition-opacity group-hover/bar:opacity-100"
                style={{ left: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {player.isError ? "Couldn't play" : `${formatTime(player.currentTime)} / ${formatTime(total)}`}
            </span>
          </div>
        )}
      </div>

      {/* Right rail: source tag, genre chip, total time (idle), zap. */}
      <div className="flex shrink-0 items-center gap-2">
        {sourceLabel && (
          <span className="hidden rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:inline">{sourceLabel}</span>
        )}
        {genre && (
          <span className={`hidden rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-opacity sm:inline ${revealCls}`}>
            {genre}
          </span>
        )}
        {!player.isActive && total > 0 && (
          <span className="text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">{formatTime(total)}</span>
        )}
        {onZap && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onZap(); }}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-amber-500 transition-all hover:bg-amber-50 dark:hover:bg-amber-500/10 ${revealCls}`}
            aria-label="Zap this track"
            title="Send a zap to support this track"
            data-testid="track-zap"
            data-noopen
          >
            <FlashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
