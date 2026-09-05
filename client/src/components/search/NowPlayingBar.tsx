import { useEffect, useRef } from "react";
import { Link } from "wouter";
import { Loader2, Pause, Play, SkipForward, X } from "lucide-react";
import { closePlayer, extendPlaylist, formatTime, peekNext, playNext, seekTrack, togglePlayback, trackMeta, usePlayerState } from "@/lib/audioPlayer";
import { moreFromArtist } from "@/lib/upNext";
import { registerBottomChrome } from "@/lib/bottomChrome";
import { Equalizer } from "@/components/share/EmbeddedTrackCard";
import audioDefault from "@/assets/audio-default.webp";

/**
 * The app's one player bar, mounted once at the shell. Docked full width at
 * the bottom of the window — above the phone's tab bar — wherever the
 * listener goes while a track this app started is active: cover, title (a
 * link to the track's page), artist, a seekable line, what is next, pause,
 * next, and an X that stops the sound and takes the bar away. It wears the
 * artwork, Apple Music's way: the cover blurred wide is the bar's own light,
 * white type over it. It is a view of the shared player every row already
 * uses, not a player of its own; the page gets room under it through the
 * bottom-chrome ledger, so no row is ever hidden behind it.
 */
export function NowPlayingBar() {
  const player = usePlayerState();
  const current = trackMeta(player.currentId);
  const shown = !!player.currentId && !!current?.title;
  const ref = useRef<HTMLDivElement>(null);

  // Occupy our height while shown, so pages pad under us and floating things stack above.
  useEffect(() => {
    if (!shown) return;
    const el = ref.current;
    const h = el?.offsetHeight || 64;
    return registerBottomChrome("player", `${h}px`);
  }, [shown]);

  // A lone track with nothing behind it asks its artist for more — once per
  // track — so Next always has somewhere to go. No queue to manage.
  const asked = useRef<Set<string>>(new Set());
  const currentId = player.currentId;
  const nextNow = peekNext(currentId);
  useEffect(() => {
    if (!currentId || !current?.title || nextNow || asked.current.has(currentId)) return;
    asked.current.add(currentId);
    let alive = true;
    void moreFromArtist({ id: currentId, ...current }).then((more) => {
      if (alive && more.length > 0 && peekNext(currentId) === null) extendPlaylist(more);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, nextNow]);

  if (!shown || !player.currentId || !current) return null;
  const id = player.currentId;
  const pct = player.duration > 0 ? (player.currentTime / player.duration) * 100 : 0;
  const playing = player.status === "playing";
  const loading = player.status === "loading";
  const next = peekNext(id);
  const upNext = trackMeta(next?.id ?? null);
  const dressed = !!current.cover;
  const ink = dressed ? "text-white" : "text-slate-900 dark:text-slate-100";
  const inkSoft = dressed ? "text-white/70" : "text-slate-500 dark:text-slate-400";
  const external = !!current.href && /^https?:\/\//i.test(current.href);
  const title = current.href ? (
    external ? (
      <a href={current.href} target="_blank" rel="noopener noreferrer" className="hover:underline" data-testid="now-playing-link">{current.title}</a>
    ) : (
      <Link href={current.href} className="hover:underline" data-testid="now-playing-link">{current.title}</Link>
    )
  ) : (
    current.title
  );
  return (
    <div
      ref={ref}
      className={`fixed inset-x-0 z-40 border-t ${dressed ? "border-white/10 bg-slate-900" : "border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur"}`}
      style={{ bottom: "var(--bs-chrome-tabbar, 0px)" }}
      data-testid="now-playing-bar"
    >
      {dressed && (
        <>
          <img src={current.cover} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover blur-2xl opacity-70" data-testid="now-playing-backdrop" />
          <span className="pointer-events-none absolute inset-0 bg-slate-950/45" aria-hidden="true" />
        </>
      )}
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:px-4">
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
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className={`truncate text-sm font-semibold ${ink}`} data-testid="now-playing-title">{title}</p>
            {current.artist &&
              (current.artistHref ? (
                <Link href={current.artistHref} className={`hidden truncate text-xs hover:underline sm:block ${inkSoft}`} data-testid="now-playing-artist">
                  {current.artist}
                </Link>
              ) : (
                <p className={`hidden truncate text-xs sm:block ${inkSoft}`}>{current.artist}</p>
              ))}
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
            <span className={`hidden shrink-0 text-[11px] font-medium tabular-nums sm:inline ${inkSoft}`}>
              {player.status === "error" ? "Couldn't play" : `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`}
            </span>
          </div>
          {upNext?.title && (
            <p className={`mt-0.5 hidden truncate text-[11px] sm:block ${inkSoft}`} data-testid="now-playing-up-next">
              Up next · {upNext.title}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => togglePlayback()}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105 ${dressed ? "bg-white text-slate-900" : "bg-slate-900 text-white dark:bg-white dark:text-slate-900"}`}
          aria-label={playing ? "Pause" : "Play"}
          data-testid="now-playing-toggle"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => playNext()}
          disabled={!next}
          className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 sm:flex ${dressed ? "text-white/80 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"}`}
          aria-label="Next"
          data-testid="now-playing-next"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
        <button
          type="button"
          onClick={() => closePlayer()}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${dressed ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"}`}
          aria-label="Close player"
          title="Close"
          data-testid="now-playing-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
