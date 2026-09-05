import { useEffect, useRef, useState } from "react";
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
  // Closing drops the bar out of view first, then stops the sound.
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  useEffect(() => () => { if (leaveTimer.current) window.clearTimeout(leaveTimer.current); }, []);
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      setLeaving(false);
      closePlayer();
    }, 180);
  };

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
    // Always dark — Spotify's constant, in light and dark mode alike — with
    // the artwork as a soft colour glow under a strong scrim, so white type
    // reads over any cover, pale ones included. Docked: it never hides or
    // shrinks on scroll; pause must never be a hunt.
    <div
      ref={ref}
      className={`fixed inset-x-0 z-40 border-t border-white/10 bg-slate-950 text-white ${leaving ? "np-drop" : "np-rise"}`}
      style={{ bottom: "var(--bs-chrome-tabbar, 0px)" }}
      data-testid="now-playing-bar"
    >
      {current.cover && (
        <>
          <img src={current.cover} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-cover blur-2xl opacity-60" data-testid="now-playing-backdrop" />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-950/70 to-slate-950/85" aria-hidden="true" data-testid="now-playing-scrim" />
        </>
      )}
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-3 py-2 sm:px-4">
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white/10">
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
            <p className="truncate text-sm font-semibold text-white" data-testid="now-playing-title">{title}</p>
            {current.artist &&
              (current.artistHref ? (
                <Link href={current.artistHref} className="hidden truncate text-xs text-white/70 hover:underline sm:block" data-testid="now-playing-artist">
                  {current.artist}
                </Link>
              ) : (
                <p className="hidden truncate text-xs text-white/70 sm:block">{current.artist}</p>
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
              className="relative h-1 flex-1 cursor-pointer rounded-full bg-white/20"
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
            <span className="hidden shrink-0 text-[11px] font-medium tabular-nums text-white/70 sm:inline">
              {player.status === "error" ? "Couldn't play" : `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`}
            </span>
          </div>
          {upNext?.title && (
            <p className="mt-0.5 hidden truncate text-[11px] text-white/60 sm:block" data-testid="now-playing-up-next">
              Up next · {upNext.title}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => togglePlayback()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 transition-transform hover:scale-105"
          aria-label={playing ? "Pause" : "Play"}
          data-testid="now-playing-toggle"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
        </button>
        <button
          type="button"
          onClick={() => playNext()}
          disabled={!next}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-40 sm:flex"
          aria-label="Next"
          data-testid="now-playing-next"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
        <button
          type="button"
          onClick={close}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
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
