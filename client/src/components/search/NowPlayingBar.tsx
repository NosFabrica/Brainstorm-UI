import { Loader2, Pause, Play, SkipForward } from "lucide-react";
import { formatTime, peekNext, playNext, seekTrack, toggleTrack, usePlayerState } from "@/lib/audioPlayer";
import { Equalizer } from "@/components/share/EmbeddedTrackCard";
import audioDefault from "@/assets/audio-default.webp";

export interface NowPlayingMeta {
  title: string;
  artist?: string;
  cover?: string;
  src: string;
}

/**
 * What is playing, wherever the page has scrolled to: one slim bar that stays
 * at the bottom of the results while a track this page knows is active —
 * cover, title, artist, a seekable progress line, pause and next. Spotify's
 * anchor, kept thin; it is not a player of its own, only a view of the shared
 * one every row already uses.
 */
export function NowPlayingBar({ meta }: { meta: Map<string, NowPlayingMeta> }) {
  const player = usePlayerState();
  const current = player.currentId ? meta.get(player.currentId) : undefined;
  if (!player.currentId || !current) return null;
  const id = player.currentId;
  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const playing = player.status === "playing";
  const loading = player.status === "loading";
  const next = peekNext(id);
  const upNext = next ? meta.get(next.id) : undefined;
  // Apple Music's trick: the cover, blurred wide, is the bar's own light —
  // white type over it; without a cover the bar stays a plain card.
  const dressed = !!current.cover;
  const ink = dressed ? "text-white" : "text-slate-900 dark:text-slate-100";
  const inkSoft = dressed ? "text-white/70" : "text-slate-500 dark:text-slate-400";
  return (
    // Fixed, not sticky: the app shell clips overflow, which would pin a sticky
    // bar to the shell instead of the window. On phones it sits above the tab
    // bar, whose height MobileTabBar publishes as --bs-bottom-chrome.
    <div
      className="fixed inset-x-0 z-30 px-3 sm:px-4"
      style={{ bottom: "calc(var(--bs-bottom-chrome, 0px) + 0.75rem)" }}
      data-testid="now-playing-bar"
    >
      <div className={`relative mx-auto flex max-w-2xl items-center gap-3 overflow-hidden rounded-2xl border p-2 pr-3 shadow-lg shadow-slate-900/10 ${dressed ? "border-white/10 bg-slate-900" : "border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur"}`}>
        {dressed && (
          <>
            <img src={current.cover} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover blur-2xl opacity-70" data-testid="now-playing-backdrop" />
            <span className="pointer-events-none absolute inset-0 bg-slate-950/45" aria-hidden="true" />
          </>
        )}
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-brand-deep/10">
          <img
            src={current.cover || audioDefault}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { if (!e.currentTarget.src.includes("audio-default")) e.currentTarget.src = audioDefault; }}
          />
          {playing && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Equalizer playing className="h-4 w-4" bar="bg-white" />
            </span>
          )}
        </span>
        <div className="relative min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={`truncate text-sm font-semibold ${ink}`} data-testid="now-playing-title">{current.title}</p>
            {current.artist && <p className={`hidden truncate text-xs sm:block ${inkSoft}`}>{current.artist}</p>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div
              role="slider"
              aria-label="Seek"
              aria-valuenow={Math.round(pct)}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seekTrack(id, (e.clientX - r.left) / r.width);
              }}
              className={`relative h-1 flex-1 cursor-pointer rounded-full ${dressed ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700"}`}
            >
              <div className={`absolute inset-y-0 left-0 rounded-full ${dressed ? "bg-white" : "bg-brand-primary"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`shrink-0 text-[11px] font-medium tabular-nums ${inkSoft}`}>
              {player.status === "error" ? "Couldn't play" : `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`}
            </span>
          </div>
          {upNext && (
            <p className={`mt-0.5 hidden truncate text-[11px] sm:block ${inkSoft}`} data-testid="now-playing-up-next">
              Up next · {upNext.title}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => toggleTrack(id, current.src)}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 ${dressed ? "bg-white text-slate-900" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"}`}
          aria-label={playing ? "Pause" : "Play"}
          data-testid="now-playing-toggle"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => playNext()}
          disabled={!next}
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${dressed ? "text-white/80 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
          aria-label="Next"
          data-testid="now-playing-next"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
      </div>
    </div>
  );
}
