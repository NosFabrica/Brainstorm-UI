import { Loader2, Pause, Play, SkipForward } from "lucide-react";
import { formatTime, playNext, seekTrack, toggleTrack, usePlayerState } from "@/lib/audioPlayer";
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
  return (
    // Fixed, not sticky: the app shell clips overflow, which would pin a sticky
    // bar to the shell instead of the window. On phones it sits above the tab
    // bar, whose height MobileTabBar publishes as --bs-bottom-chrome.
    <div
      className="fixed inset-x-0 z-30 px-3 sm:px-4"
      style={{ bottom: "calc(var(--bs-bottom-chrome, 0px) + 0.75rem)" }}
      data-testid="now-playing-bar"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 p-2 pr-3 shadow-lg shadow-slate-900/10 backdrop-blur">
        <img
          src={current.cover || audioDefault}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg bg-brand-deep/10 object-cover"
          onError={(e) => { if (!e.currentTarget.src.includes("audio-default")) e.currentTarget.src = audioDefault; }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" data-testid="now-playing-title">{current.title}</p>
            {current.artist && <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">{current.artist}</p>}
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
              className="relative h-1 flex-1 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700"
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-400 dark:text-slate-500">
              {player.status === "error" ? "Couldn't play" : `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toggleTrack(id, current.src)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 transition-transform hover:scale-105"
          aria-label={playing ? "Pause" : "Play"}
          data-testid="now-playing-toggle"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => playNext()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Next"
          data-testid="now-playing-next"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
      </div>
    </div>
  );
}
