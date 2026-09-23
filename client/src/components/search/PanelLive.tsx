import { Link } from "wouter";
import { ArrowRight, Play, Radio } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useLightbox, type LightboxContextInfo } from "@/components/share/Lightbox";
import { isHlsUrl, replayEmbedUrl, streamEmbedUrl } from "@/lib/streamEmbed";
import { isVideoFileUrl } from "@/lib/linkThumb";
import type { PickedStreams } from "@/lib/liveStream";
import { eventPath } from "@/lib/shareId";
import { relativeTime } from "@/lib/relativeTime";
import type { LiveStream } from "@/lib/liveStream";

type Author = LightboxContextInfo["author"];

/**
 * The person's stream, in their panel. Live: a card that leads the panel —
 * poster, LIVE, how many are watching, the title. Ended with a recording: the
 * same card wearing Replay. Either plays on the one tap the way the videos in
 * Latest do — full view, starting at once — the platform's player for
 * Twitch/Kick/YouTube, our HLS player for a raw stream (Benjamin: "click to
 * expand and play, like the videos"). "Open" goes to the stream page.
 * Announced and not started: one quiet line saying when.
 */
export function PanelLive({ live, upcoming, replay, author }: PickedStreams & { author?: Author }) {
  if (!live && replay) return <ReplayCard stream={replay} author={author} />;
  if (live) {
    const href = eventPath({ id: live.id, pubkey: live.pubkey });
    const embed = live.streaming ? streamEmbedUrl(live.streaming, typeof window !== "undefined" ? window.location.hostname : "") : null;
    const hls = !embed && !!live.streaming && isHlsUrl(live.streaming);
    const item = embed ? { url: embed, kind: "embed" as const, poster: live.image } : hls ? { url: live.streaming as string, kind: "hls" as const, poster: live.image } : null;
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-rose-200 dark:border-rose-500/30 bg-white dark:bg-slate-900" data-testid="person-live">
        <div className="relative aspect-video bg-slate-900">
          {live.image ? (
            <img src={live.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
              <Radio className="h-6 w-6" />
            </div>
          )}
          {item ? (
            <PlayFullView item={item} author={author} href={href} label="Play live stream" />
          ) : (
            <Link href={href} className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/15" aria-label="Open the live stream">
              <PlayBadge />
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

function PlayBadge() {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow-lg transition-transform group-hover:scale-105">
      <Play className="ml-0.5 h-5 w-5 fill-current" />
    </span>
  );
}

/** The one tap: the stream opens full view, playing, credited, with the way to its page. */
function PlayFullView({ item, author, href, label }: { item: { url: string; kind: "hls" | "embed" | "video"; poster?: string }; author?: Author; href: string; label: string }) {
  const openLightbox = useLightbox();
  return (
    <button
      type="button"
      onClick={() => openLightbox([{ url: item.url, kind: item.kind, poster: item.poster ?? null }], 0, { author: author ?? null, postHref: href })}
      className="group absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15"
      aria-label={label}
      data-testid="person-live-play"
    >
      <PlayBadge />
    </button>
  );
}

/**
 * An ended stream that left a recording: the live card's shape with a Replay
 * chip. The tap opens the recording full view — YouTube through its player,
 * HLS through ours, a plain video file as a video — and "Open" the stream
 * page. Ended streams with nothing to replay never reach here.
 */
function ReplayCard({ stream, author }: { stream: LiveStream; author?: Author }) {
  const href = eventPath({ id: stream.id, pubkey: stream.pubkey });
  const rec = stream.recording as string;
  const embed = replayEmbedUrl(rec);
  const item = embed
    ? { url: embed, kind: "embed" as const, poster: stream.image }
    : isHlsUrl(rec)
      ? { url: rec, kind: "hls" as const, poster: stream.image }
      : isVideoFileUrl(rec)
        ? { url: rec, kind: "video" as const, poster: stream.image }
        : null;
  const when = stream.startsSec || stream.createdAt;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" data-testid="person-live-replay">
      <div className="relative aspect-video bg-slate-900">
        {stream.image ? (
          <img src={stream.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500"><Radio className="h-6 w-6" /></div>
        )}
        {item ? (
          <PlayFullView item={item} author={author} href={href} label="Play replay" />
        ) : (
          <a href={rec} target="_blank" rel="noopener" className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/20" aria-label="Watch the replay">
            <PlayBadge />
          </a>
        )}
        <div className="absolute left-2 top-2">
          <Chip size="sm" tone="slate">Replay</Chip>
        </div>
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
