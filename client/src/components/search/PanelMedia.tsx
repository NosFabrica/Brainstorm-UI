import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Pause, Play, Video } from "lucide-react";
import { useLightbox } from "@/components/share/Lightbox";
import { isVideoUrl, mediaPosterOf, mediaUrlOf } from "@/components/search/cards";
import { fetchFountainItem, fountainRef, type FountainItem } from "@/lib/fountain";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { eventPath } from "@/lib/shareId";
import { relativeTime } from "@/lib/relativeTime";
import { getDisplayLabel, type SearchResult } from "@/lib/profileSearch";
import type { NostrEvent } from "nostr-tools";
import { noteTitle } from "@/lib/noteTitle";

/**
 * A person's latest media, in their panel — Google's panel for a channel.
 * Videos they posted (a note with a video attached, or a video event) and
 * podcast episodes they linked on Fountain, newest first, three at most.
 * Every row plays here: a video opens full-size in the lightbox with the
 * author bar; a podcast plays through the shared audio player.
 */
export type LatestMediaItem =
  | { kind: "video"; id: string; title: string; poster: string | null; url: string; at: number; href: string }
  | { kind: "podcast"; id: string; title: string; show: string | null; poster: string | null; audio: string; at: number; href: string; pageUrl: string };

const FOUNTAIN_LINK = /https?:\/\/(?:www\.)?fountain\.fm\/(?:episode|track)\/[A-Za-z0-9_-]+/g;

export function latestVideos(events: NostrEvent[]): Extract<LatestMediaItem, { kind: "video" }>[] {
  const out: Extract<LatestMediaItem, { kind: "video" }>[] = [];
  for (const e of events) {
    const url = mediaUrlOf(e);
    if (!url || !isVideoUrl(e, url)) continue;
    out.push({ kind: "video", id: e.id, title: noteTitle(e.content) || "Video", poster: mediaPosterOf(e), url, at: e.created_at, href: eventPath(e) });
  }
  return out;
}

export function fountainLinksOf(events: NostrEvent[]): { event: NostrEvent; url: string }[] {
  const out: { event: NostrEvent; url: string }[] = [];
  for (const e of events) {
    const m = (e.content || "").match(FOUNTAIN_LINK);
    if (m && fountainRef(m[0])) out.push({ event: e, url: m[0] });
  }
  return out;
}

export function PanelLatestMedia({ person, events, max = 3 }: { person: SearchResult; events: NostrEvent[]; max?: number }) {
  const openLightbox = useLightbox();
  const [podcasts, setPodcasts] = useState<Extract<LatestMediaItem, { kind: "podcast" }>[]>([]);
  const videos = useMemo(() => latestVideos(events), [events]);
  const podcastLinks = useMemo(() => fountainLinksOf(events).slice(0, max), [events, max]);

  useEffect(() => {
    let cancelled = false;
    if (podcastLinks.length === 0) {
      setPodcasts([]);
      return;
    }
    Promise.all(
      podcastLinks.map(async ({ event, url }) => {
        const item: FountainItem | null = await fetchFountainItem(url);
        return item ? ({ kind: "podcast" as const, id: event.id, title: item.title, show: item.show, poster: item.image, audio: item.audio, at: event.created_at, href: eventPath(event), pageUrl: item.url }) : null;
      }),
    ).then((rows) => {
      if (!cancelled) setPodcasts(rows.filter((r): r is Extract<LatestMediaItem, { kind: "podcast" }> => r !== null));
    });
    return () => {
      cancelled = true;
    };
  }, [podcastLinks]);

  const items = useMemo(() => [...videos, ...podcasts].sort((a, b) => b.at - a.at).slice(0, max), [videos, podcasts, max]);
  if (items.length === 0) return null;
  const author = { name: getDisplayLabel(person), npub: person.npub, picture: person.picture ?? null };

  return (
    <div className="mt-3" data-testid="person-media">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Latest</span>
        <Link href={`/p/${person.npub}`} className="text-[11px] font-medium text-brand-deep dark:text-brand-link hover:underline" data-testid="person-media-more">
          All →
        </Link>
      </div>
      <div className="space-y-1">
        {items.map((item) =>
          item.kind === "video" ? (
            <MediaRow
              key={item.id}
              testId={`person-media-item-${item.id}`}
              poster={item.poster}
              videoUrl={item.url}
              title={item.title}
              label="Video"
              at={item.at}
              href={item.href}
              icon={<Video className="h-3 w-3" />}
              onPlay={() => openLightbox([{ url: item.url, kind: "video", poster: item.poster }], 0, { author, postHref: item.href })}
              playing={false}
            />
          ) : (
            <PodcastRow key={item.id} item={item} show={item.show} />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * A podcast episode is audio, so it is the same row as a song — cover as the
 * play button, title, the show as the artist line, Fountain named as the
 * source, progress when it plays — Benjamin's "universal" UI. Fountain's page
 * title carries its own call to action ("• Watch on Fountain"); the row does not.
 */
function PodcastRow({ item, show }: { item: Extract<LatestMediaItem, { kind: "podcast" }>; show: string | null }) {
  return (
    <div data-testid={`person-media-item-${item.id}`}>
      <EmbeddedTrackCard
        id={`fountain:${item.id}`}
        title={item.title.replace(/\s*[•·|–-]\s*(?:Watch|Listen) on Fountain\s*$/i, "").trim() || item.title}
        artist={show ?? undefined}
        cover={item.poster ?? undefined}
        audio={item.audio}
        sourceLabel="Fountain"
        href={item.href}
      />
    </div>
  );
}

function MediaRow({ testId, poster, videoUrl, title, label, at, href, icon, onPlay, playing }: { testId: string; poster: string | null; /** A clip without a poster still has a first frame: the browser paints it from the metadata alone. */ videoUrl?: string; title: string; label: string; at: number; href: string; icon: React.ReactNode; onPlay: () => void; playing: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5" data-testid={testId}>
      <button
        type="button"
        onClick={onPlay}
        className="group/cover relative h-11 w-16 shrink-0 overflow-hidden rounded-md bg-slate-900"
        aria-label={playing ? `Pause ${title}` : `Play ${title}`}
      >
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : videoUrl ? (
          <video src={`${videoUrl}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden className="pointer-events-none h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-slate-500">{icon}</span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors group-hover/cover:bg-black/40">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-brand-primary shadow">
            {playing ? <Pause className="h-3 w-3 fill-current" /> : <Play className="ml-px h-3 w-3 fill-current" />}
          </span>
        </span>
      </button>
      <Link href={href} className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900 dark:text-slate-100">{title}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          {icon} {label} · {relativeTime(at)}
        </p>
      </Link>
    </div>
  );
}
