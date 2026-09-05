import { useWavlakeTrack, wavlakeTrackId, wavlakeTrackUrl } from "@/lib/wavlake";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { LinkChip } from "@/components/share/LinkPreview";
import { profileHrefOf } from "@/lib/upNext";

/**
 * Resolves a wavlake.com/track/<id> link into a real inline player (artwork +
 * title + artist + play/seek), reusing the shared audio player so it coordinates
 * with the rest of the page. Shows a skeleton while resolving and falls back to a
 * plain link chip if the track can't be fetched.
 */
export function WavlakeTrackCard({ url }: { url: string }) {
  const id = wavlakeTrackId(url);
  const { loading, track, error } = useWavlakeTrack(id);

  if (!id || error) return <LinkChip url={url} />;

  if (loading || !track) {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5" data-testid="wavlake-loading">
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2" data-testid="wavlake-track">
      <EmbeddedTrackCard
        id={`wavlake:${track.id}`}
        title={track.title}
        artist={track.artist}
        cover={track.artworkUrl}
        audio={track.audioUrl}
        durationSec={track.duration}
        sourceLabel="Wavlake"
        onOpen={() => window.open(wavlakeTrackUrl(track.id), "_blank", "noopener")}
        pageUrl={wavlakeTrackUrl(track.id)}
        artistHref={profileHrefOf(track.artistNpub)}
      />
    </div>
  );
}
