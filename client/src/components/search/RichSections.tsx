/**
 * The media-rich pieces of the composed page, Google's anatomy: a Top
 * stories strip (image on top, source, headline, age) leading Latest, and a
 * tile grid for Media (photos as images, videos with a play badge and their
 * poster or first frame, captions with author and age). Both open the in-app
 * event page; a story's headline goes out to the article.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Play } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Favicon } from "@/components/share/LinkPreview";
import { isVideoUrl, mediaPosterOf, mediaUrlOf, tagVal } from "@/components/search/cards";
import { parseNewsShape, type NewsShape } from "@/lib/newsShape";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel } from "@/lib/profileSearch";
import type { SearchHit } from "@/services/search";

const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif)(?:\?|#|$)/i;
const VIDEO_KINDS = new Set([21, 22, 34235, 34236]);
const MAX_STORIES = 4;

function ago(created_at: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - created_at);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(created_at * 1000).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export type TopStory = { hit: SearchHit; news: NewsShape & { imageUrl: string } };

/**
 * Which Latest hits earn the strip: news-shaped notes that carry a picture,
 * one per author, at most four — the freshest first, as they arrive.
 */
export function pickTopStories(hits: SearchHit[]): TopStory[] {
  const out: TopStory[] = [];
  const seenAuthors = new Set<string>();
  for (const hit of hits) {
    if (out.length >= MAX_STORIES) break;
    const e = hit.event;
    if (tagVal(e, "title") || tagVal(e, "name") || !e.content) continue;
    const news = parseNewsShape(e.content);
    const imageUrl = news?.imageUrl ?? tagVal(e, "image") ?? null;
    if (!news || !imageUrl || seenAuthors.has(e.pubkey)) continue;
    seenAuthors.add(e.pubkey);
    out.push({ hit, news: { ...news, imageUrl } });
  }
  return out;
}

function TopStoryCard({ story }: { story: TopStory }) {
  const [, navigate] = useLocation();
  const [imgFailed, setImgFailed] = useState(false);
  const { hit, news } = story;
  const open = () => navigate(eventPath(hit.event));
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      className="group flex w-56 shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid={`top-story-${hit.event.id}`}
    >
      {!imgFailed && (
        <img
          src={news.imageUrl}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="aspect-[16/10] w-full object-cover bg-slate-100 dark:bg-slate-800"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col p-2.5">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
          <Favicon host={news.domain} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
          <span className="truncate">{news.domain}</span>
        </div>
        <a
          href={news.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-1 line-clamp-3 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100 hover:text-brand-primary hover:underline"
        >
          {news.headline}
        </a>
        <div className="mt-auto pt-1.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
          {hit.author ? getDisplayLabel(hit.author) : "Unknown"} · {ago(hit.event.created_at)}
        </div>
      </div>
    </div>
  );
}

/** The horizontal Top stories strip. */
export function TopStories({ stories, stripRef }: { stories: TopStory[]; stripRef?: (el: HTMLDivElement | null) => void }) {
  if (stories.length === 0) return null;
  return (
    <div
      ref={stripRef}
      className="mb-2 flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="serp-top-stories"
    >
      {stories.map((s) => (
        <TopStoryCard key={s.hit.event.id} story={s} />
      ))}
    </div>
  );
}

function MediaTile({ hit }: { hit: SearchHit }) {
  const [, navigate] = useLocation();
  const [imgFailed, setImgFailed] = useState(false);
  const e = hit.event;
  const url = mediaUrlOf(e);
  const isImage = !!url && IMAGE_RE.test(url);
  const poster = isImage ? url : (mediaPosterOf(e) ?? null);
  const isVideo = VIDEO_KINDS.has(e.kind) || (!!url && !isImage && isVideoUrl(e, url));
  const open = () => navigate(eventPath(e));
  const caption = (e.content || tagVal(e, "title") || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(ev) => {
        if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault();
          open();
        }
      }}
      className="group cursor-pointer overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid={`media-tile-${e.id}`}
    >
      <div className="relative aspect-[4/3] bg-slate-100 dark:bg-slate-800">
        {poster && !imgFailed ? (
          <img src={poster} alt="" loading="lazy" onError={() => setImgFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : url && isVideo ? (
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {isVideo && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            data-testid="media-tile-play"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md">
              <Play className="ml-0.5 h-4 w-4 text-brand-deep" />
            </span>
          </span>
        )}
      </div>
      <div className="p-2">
        {caption && <p className="line-clamp-2 text-[12px] leading-snug text-slate-700 dark:text-slate-200">{caption}</p>}
        <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
          {hit.author ? getDisplayLabel(hit.author) : "Unknown"} · {ago(e.created_at)}
        </p>
      </div>
    </div>
  );
}

/** The Media tile grid — two across on phones, three on wider screens. */
export function MediaTiles({ hits }: { hits: SearchHit[] }) {
  if (hits.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="serp-media-grid">
      {hits.map((h) => (
        <MediaTile key={h.event.id} hit={h} />
      ))}
    </div>
  );
}

/** Events that have anything visual to tile — the rest stay rows. */
export function hasVisual(e: NostrEvent): boolean {
  return !!(mediaUrlOf(e) || mediaPosterOf(e));
}
