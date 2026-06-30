import { Music as MusicIcon, Play, Pause, Loader2, AlertCircle } from "lucide-react";
import { useTrackPlayer, useTrackDuration, toggleTrack, seekTrack, formatTime, audioUrlFromEvent } from "@/lib/audioPlayer";
import type { MinimalEvent } from "@/lib/noteRefs";

const tagVal = (ev: MinimalEvent, k: string) => ev.tags.find((t) => t[0] === k)?.[1];

/**
 * A focused "now playing" hero for a music event (kind-31337) on the /e page:
 * large cover art, title + artist, a full-width player (big play/pause, seek bar,
 * elapsed/total time) and genre + description metadata. Reuses the shared audio
 * player, so it's the same one-at-a-time playback that pauses on navigation.
 */
export function AudioHero({ event }: { event: MinimalEvent }) {
  const id = event.id;
  const title = tagVal(event, "title") || tagVal(event, "subject") || "Untitled track";
  const artist = tagVal(event, "artist") || tagVal(event, "creator") || tagVal(event, "c") || "";
  const cover = tagVal(event, "image") || tagVal(event, "cover");
  const audio = audioUrlFromEvent(event);
  const genres = event.tags
    .filter((t) => t[0] === "t" && t[1])
    .map((t) => t[1])
    .filter((g) => g.toLowerCase() !== "music")
    .map((g) => g.charAt(0).toUpperCase() + g.slice(1));
  const durationSec = Number(tagVal(event, "duration")) || undefined;
  const description = (tagVal(event, "summary") || event.content || "").trim();

  const player = useTrackPlayer(id);
  const metaDuration = useTrackDuration(durationSec ? undefined : audio);
  const total = player.isActive && player.duration ? player.duration : durationSec ?? metaDuration ?? 0;
  const pct = total > 0 ? (player.currentTime / total) * 100 : 0;
  const playable = !!audio;

  return (
    <div data-testid="audio-hero">
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
        {/* Cover */}
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-[#333286]/10 sm:h-44 sm:w-44">
          {cover ? (
            <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <MusicIcon className="h-10 w-10 text-[#333286]" />
            </div>
          )}
        </div>

        {/* Title, artist, genre, player */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#3730a3]">
            <MusicIcon className="h-3 w-3" /> Track
          </span>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl" style={{ fontFamily: "var(--font-display)" }}>
            {title}
          </h1>
          {artist && <p className="mt-0.5 text-sm font-medium text-slate-500">{artist}</p>}

          {genres.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <span key={g} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{g}</span>
              ))}
            </div>
          )}

          {/* Full-width player */}
          <div className="mt-auto flex items-center gap-3 pt-4">
            <button
              type="button"
              disabled={!playable}
              onClick={() => { if (audio) toggleTrack(id, audio); }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#3730a3] text-white shadow-sm transition-colors hover:bg-[#312e81] disabled:opacity-40"
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
                className="group relative h-1.5 cursor-pointer rounded-full bg-slate-200"
              >
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#3730a3]" style={{ width: `${pct}%` }} />
                <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3730a3] opacity-0 shadow transition-opacity group-hover:opacity-100" style={{ left: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] font-medium tabular-nums text-slate-400">
                <span>{player.isError ? "Couldn't play this track" : formatTime(player.currentTime)}</span>
                <span>{formatTime(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {description && description !== title && (
        <p className="mt-4 whitespace-pre-line break-words border-t border-slate-100 pt-4 text-sm leading-relaxed text-slate-600">{description}</p>
      )}
    </div>
  );
}
