import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Play, Radio } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { LiveVideoPlayer } from "@/components/share/LiveVideoPlayer";
import { isHlsUrl, replayEmbedUrl, streamEmbedUrl } from "@/lib/streamEmbed";
import { isVideoFileUrl } from "@/lib/linkThumb";
import type { PickedStreams } from "@/lib/liveStream";
import { eventPath } from "@/lib/shareId";
import { relativeTime } from "@/lib/relativeTime";
import type { LiveStream } from "@/lib/liveStream";

/**
 * The person's stream, in their panel. Live: a card that leads the panel —
 * poster, LIVE, how many are watching, the title — and plays where it is on
 * tap: the platform's player for Twitch/Kick/YouTube, our HLS player for a
 * raw stream, and the stream page when the event names no video at all.
 * Not live: one quiet line saying when they last streamed, linking to it.
 */
export function PanelLive({ live, upcoming, replay }: PickedStreams) {
  const [playing, setPlaying] = useState(false);
  if (!live && replay) return <ReplayCard stream={replay} />;
  if (live) {
    const href = eventPath({ id: live.id, pubkey: live.pubkey });
    const embed = live.streaming ? streamEmbedUrl(live.streaming, typeof window !== "undefined" ? window.location.hostname : "") : null;
    const hls = !embed && !!live.streaming && isHlsUrl(live.streaming);
    const canPlayHere = !!embed || hls;
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-slate-900" data-testid="person-live">
        <div className="relative aspect-video bg-slate-900">
          {playing && embed ? (
            <iframe
              src={embed}
              title={`${live.title} — live`}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              data-testid="person-live-embed"
            />
          ) : playing && hls ? (
            <LiveVideoPlayer src={live.streaming as string} poster={live.image} autoStart frameless />
          ) : (
            <>
              {live.image ? (
                <img src={live.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <Radio className="h-6 w-6" />
                </div>
              )}
              {canPlayHere ? (
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  className="group absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15"
                  aria-label="Play live stream"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow-lg transition-transform group-hover:scale-105">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                </button>
              ) : (
                <Link href={href} className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/15" aria-label="Open the live stream">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow-lg">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                </Link>
              )}
              <div className="absolute left-2 top-2 flex items-center gap-1.5">
                <Chip size="sm" tone="danger" dot>
                  LIVE
                </Chip>
                {live.viewers !== undefined && (
                  <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{live.viewers.toLocaleString()} watching</span>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <p className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{live.title}</p>
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-deep dark:text-brand-link hover:underline" data-testid="person-live-open">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }
  if (upcoming) {
    return (
      <Link
        href={eventPath({ id: upcoming.id, pubkey: upcoming.pubkey })}
        className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-brand-deep dark:hover:text-brand-link"
        data-testid="person-live-upcoming"
      >
        <Radio className="h-3 w-3 shrink-0 text-brand-primary" />
        <span className="truncate">
          Streams {upcoming.startsSec ? relativeTime(upcoming.startsSec) : "soon"} · {upcoming.title}
        </span>
      </Link>
    );
  }
  return null;
}

/**
 * An ended stream that left a recording: the live card's shape with a Replay
 * chip, playing on tap — YouTube through its player, HLS through ours, a plain
 * video file as a video — and "Open" to the stream page. Ended streams with
 * nothing to replay never reach here.
 */
function ReplayCard({ stream }: { stream: LiveStream }) {
  const [playing, setPlaying] = useState(false);
  const href = eventPath({ id: stream.id, pubkey: stream.pubkey });
  const rec = stream.recording as string;
  const embed = replayEmbedUrl(rec);
  const hls = !embed && isHlsUrl(rec);
  const file = !embed && !hls && isVideoFileUrl(rec);
  const canPlayHere = !!embed || hls || file;
  const when = stream.startsSec || stream.createdAt;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" data-testid="person-live-replay">
      <div className="relative aspect-video bg-slate-900">
        {playing && embed ? (
          <iframe src={embed} title={`${stream.title} — replay`} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen data-testid="person-live-embed" />
        ) : playing && hls ? (
          <LiveVideoPlayer src={rec} poster={stream.image} autoStart frameless />
        ) : playing && file ? (
          <video src={rec} poster={stream.image} controls autoPlay playsInline className="absolute inset-0 h-full w-full object-contain" data-testid="person-live-video" />
        ) : (
          <>
            {stream.image ? (
              <img src={stream.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500"><Radio className="h-6 w-6" /></div>
            )}
            {canPlayHere ? (
              <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/20" aria-label="Play replay">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow-lg transition-transform group-hover:scale-105"><Play className="ml-0.5 h-5 w-5 fill-current" /></span>
              </button>
            ) : (
              <a href={rec} target="_blank" rel="noopener" className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20" aria-label="Watch the replay">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow-lg"><Play className="ml-0.5 h-5 w-5 fill-current" /></span>
              </a>
            )}
            <div className="absolute left-2 top-2">
              <Chip size="sm" tone="slate">Replay</Chip>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{stream.title}</p>
        <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">Streamed {relativeTime(when)}</span>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-deep dark:text-brand-link hover:underline" data-testid="person-live-open">
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
