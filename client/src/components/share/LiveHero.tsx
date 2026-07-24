import { useState } from "react";
import { nip19 } from "nostr-tools";
import { Radio, Users, ExternalLink, CalendarClock } from "lucide-react";
import { LiveVideoPlayer } from "@/components/share/LiveVideoPlayer";
import { relativeEventTime } from "@/lib/calendarEvent";
import liveDefault from "@/assets/live-default.webp";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * A live-stream watch hero for kind-30311 (NIP-53) on /e: an embedded HLS player
 * when live, with state-aware fallbacks (upcoming countdown, ended, or a "watch
 * externally" card if the stream can't embed). Title + live badge + viewer count
 * + start time round it out; the host row + Web-of-Trust come from EventPage.
 */
export function LiveHero({ event }: { event: MinimalEvent }) {
  const tag = (k: string) => event.tags.find((t) => t[0] === k)?.[1];
  const title = tag("title") || tag("summary") || "Live stream";
  const status = (tag("status") || "").toLowerCase();
  const image = tag("image") || tag("thumb");
  const streaming = tag("streaming");
  const starts = Number(tag("starts")) || 0;
  const viewers = Number(tag("current_participants")) || 0;
  const summary = (tag("summary") || event.content || "").trim();
  const nowSec = Math.floor(Date.now() / 1000);
  const isLive = status === "live";
  const isUpcoming = !isLive && (status === "planned" || (starts > nowSec && status !== "ended"));

  const [failed, setFailed] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  // Branded live-stream cover when the stream has no image / it fails to load.
  const posterImage = !image || imgBroken ? liveDefault : image;

  let watchUrl: string | undefined;
  try { watchUrl = `https://zap.stream/${nip19.naddrEncode({ kind: 30311, pubkey: event.pubkey, identifier: tag("d") || "", relays: [] })}`; } catch { /* skip */ }

  const canEmbed = isLive && !!streaming && !failed;

  return (
    <div data-testid="live-hero">
      {canEmbed ? (
        <LiveVideoPlayer src={streaming as string} poster={posterImage} onError={() => setFailed(true)} />
      ) : (
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-900" data-testid="live-state">
          <img src={posterImage} alt="" onError={() => setImgBroken(true)} className="absolute inset-0 h-full w-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-slate-900/40" />
          <div className="relative flex flex-col items-center gap-2 px-6 text-center text-white">
            {isUpcoming ? (
              <>
                <CalendarClock className="h-7 w-7 opacity-90" />
                <p className="text-sm font-bold uppercase tracking-wide">Upcoming</p>
                {starts > 0 && <p className="text-lg font-bold">{relativeEventTime(starts)}</p>}
                <p className="text-xs text-white/70">Open in a Nostr app to set a reminder</p>
              </>
            ) : isLive ? (
              <>
                <Radio className="h-7 w-7 opacity-90" />
                <p className="text-sm font-semibold">This stream can&apos;t play here</p>
                {watchUrl && (
                  <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-link transition-colors hover:bg-slate-100" data-testid="live-watch-external">
                    <ExternalLink className="h-4 w-4" /> Watch on zap.stream
                  </a>
                )}
              </>
            ) : (
              <>
                <Radio className="h-7 w-7 opacity-70" />
                <p className="text-sm font-semibold">This stream has ended</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {isLive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
          </span>
        )}
        {isLive && viewers > 0 && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {viewers.toLocaleString()} watching</span>}
        {starts > 0 && <span>{isLive ? "Started" : isUpcoming ? "Starts" : "Was"} {relativeEventTime(starts).toLowerCase()}</span>}
      </div>

      <h1 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl" style={{ fontFamily: "var(--font-display)" }} data-testid="live-hero-title">
        {title}
      </h1>

      {summary && summary !== title && (
        <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-600 dark:text-slate-300">{summary}</p>
      )}

      {watchUrl && canEmbed && (
        <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-link hover:underline">
          <ExternalLink className="h-3.5 w-3.5" /> Open in zap.stream
        </a>
      )}
    </div>
  );
}
