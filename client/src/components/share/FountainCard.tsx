import { type MouseEvent } from "react";
import { AlertCircle, ExternalLink, Headphones, Loader2, Pause, Play } from "lucide-react";
import { Favicon } from "@/components/share/LinkPreview";
import { formatTime, seekTrack, toggleTrack, useTrackDuration, useTrackPlayer } from "@/lib/audioPlayer";
import { useFountainItem, type FountainItem } from "@/lib/fountain";

/**
 * A Fountain episode or track under a note: artwork, the show or artist, the
 * title, the description — and a play button that plays it right here through
 * the shared player, seek bar and all. Fountain stays one click away.
 *
 * Until the page has answered, and whenever it cannot (a network that blocks
 * fountain.fm, a deleted episode), the card is the plain "Listen on Fountain"
 * link it replaced — never a blank, never a dead button.
 */
export function FountainCard({ url }: { url: string }) {
  const { loading, item } = useFountainItem(url);
  if (!item) return <FountainLinkCard url={url} pending={loading} />;
  return <FountainItemCard item={item} />;
}

function FountainItemCard({ item }: { item: FountainItem }) {
  const id = `fountain:${item.kind}:${item.id}`;
  const player = useTrackPlayer(id);
  const metaDuration = useTrackDuration(item.audio);
  const total = player.isActive && player.duration ? player.duration : metaDuration ?? 0;
  const pct = total > 0 ? (player.currentTime / total) * 100 : 0;
  const play = (e: MouseEvent) => {
    e.stopPropagation();
    toggleTrack(id, item.audio);
  };
  return (
    <div
      className={`mt-2 overflow-hidden rounded-xl border bg-white dark:bg-slate-900 transition-colors ${
        player.isActive ? "border-brand-link/30 ring-1 ring-brand-link/10" : "border-slate-200 dark:border-slate-800"
      }`}
      data-testid="fountain-card"
    >
      <div className="flex gap-3 p-3">
        <button
          type="button"
          onClick={play}
          className="group/cover relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-brand-deep/10"
          aria-label={player.isPlaying ? "Pause" : "Play"}
          data-testid="fountain-play"
        >
          {item.image ? (
            <img src={item.image} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-brand-deep dark:text-brand-link">
              <Headphones className="h-6 w-6" />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover/cover:bg-black/40">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-brand-link shadow-md ring-1 ring-black/5 transition-transform group-hover/cover:scale-105">
              {player.isError ? (
                <AlertCircle className="h-4 w-4 text-red-500" />
              ) : player.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : player.isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px] fill-current" />
              )}
            </span>
          </span>
        </button>
        <div className="min-w-0 flex-1">
          {item.show && (
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.show}</p>
          )}
          <p className={`mt-0.5 text-sm font-semibold leading-snug line-clamp-2 ${player.isActive ? "text-brand-link" : "text-slate-900 dark:text-slate-100"}`}>
            {item.title}
          </p>
          {item.description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-3">{item.description}</p>
          )}
        </div>
      </div>
      {player.isActive && (
        <div className="flex items-center gap-2 px-3 pb-2" data-noopen>
          <div
            role="slider"
            aria-label="Seek"
            aria-valuenow={Math.round(pct)}
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              seekTrack(id, (e.clientX - r.left) / r.width);
            }}
            className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700"
            data-testid="fountain-seek"
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-brand-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {formatTime(player.currentTime)} / {total ? formatTime(total) : "–:––"}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <Favicon host="fountain.fm" className="h-3 w-3" /> Fountain · {item.kind === "track" ? "track" : "podcast episode"}
          {!player.isActive && metaDuration ? ` · ${formatTime(metaDuration)}` : ""}
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 font-medium text-brand-deep dark:text-brand-link hover:underline"
          data-testid="fountain-open"
        >
          Open on Fountain <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

/** The plain link card: before the page answers, and when it never does. */
export function FountainLinkCard({ url, pending = false }: { url: string; pending?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 no-underline hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
      data-testid="link-card-fountain"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-deep dark:text-brand-link">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Headphones className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Listen on Fountain</span>
        <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <Favicon host="fountain.fm" className="h-3 w-3" /> fountain.fm · podcast episode
        </span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
    </a>
  );
}
