/**
 * The media-rich pieces of the composed page, Google's anatomy: a Top
 * stories strip (image on top, source, headline, age) leading Latest, and a
 * tile grid for Media (photos as images, videos with a play badge and their
 * poster or first frame, captions with author and age). Both open the in-app
 * event page; a story's headline goes out to the article.
 */
import { useEffect, useState } from "react";
import { fetchUnfurl } from "@/services/unfurl";
import { useLocation } from "wouter";
import { Newspaper, Play } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Favicon } from "@/components/share/LinkPreview";
import { useLightbox } from "@/components/share/Lightbox";
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

/** A strip card's content. `url`/`domain` are null for a pictured note that
 *  isn't news-shaped; `imageUrl` is null for news that came without a picture. */
export type StoryShape = { headline: string; url: string | null; domain: string | null; imageUrl: string | null };
export type TopStory = { hit: SearchHit; news: StoryShape };

/** A strip of one or two reads as an accident (Benjamin: "there should always
 *  be 3") — so the picker fills to this many before it stops looking. */
const MIN_STORIES = 3;
const URL_IN_TEXT = /https?:\/\/\S+/g;

function firstImageIn(content: string): string | null {
  for (const url of content.match(URL_IN_TEXT) ?? []) if (IMAGE_RE.test(url)) return url;
  return null;
}

/**
 * Which Latest hits earn the strip, one per author, freshest first: pictured
 * news leads; when that runs short of three, unpictured news fills in, then
 * notes that carry a picture (their first line as the headline). Never more
 * than four, and never fewer than three — short of three, no strip.
 */
export function pickTopStories(hits: SearchHit[]): TopStory[] {
  const out: TopStory[] = [];
  const seenAuthors = new Set<string>();
  const seenIds = new Set<string>();
  const eligible = hits.filter((h) => !tagVal(h.event, "title") && !tagVal(h.event, "name") && !!h.event.content);
  const take = (hit: SearchHit, news: StoryShape) => {
    seenAuthors.add(hit.event.pubkey);
    seenIds.add(hit.event.id);
    out.push({ hit, news });
  };
  const pass = (limit: number, pick: (hit: SearchHit) => StoryShape | null) => {
    for (const hit of eligible) {
      if (out.length >= limit) return;
      if (seenIds.has(hit.event.id) || seenAuthors.has(hit.event.pubkey)) continue;
      const shape = pick(hit);
      if (shape) take(hit, shape);
    }
  };
  // 1. News with a picture — up to four.
  pass(MAX_STORIES, (hit) => {
    const news = parseNewsShape(hit.event.content);
    const imageUrl = news?.imageUrl ?? tagVal(hit.event, "image") ?? null;
    return news && imageUrl ? { ...news, imageUrl } : null;
  });
  // 2. News without one — only to reach three.
  pass(MIN_STORIES, (hit) => {
    const news = parseNewsShape(hit.event.content);
    // A picture may still ride in imeta / image tags rather than the text.
    return news ? { ...news, imageUrl: mediaUrlOf(hit.event) } : null;
  });
  // 3. A pictured note — its first line is the headline.
  pass(MIN_STORIES, (hit) => {
    const imageUrl = firstImageIn(hit.event.content) ?? tagVal(hit.event, "image");
    if (!imageUrl) return null;
    const headline = hit.event.content.replace(URL_IN_TEXT, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    return headline ? { headline: headline.slice(0, 140), url: null, domain: null, imageUrl } : null;
  });
  // Three or nothing: a strip of one or two is the accident the rule exists
  // to prevent, so Latest stays rows when there isn't enough to fill it.
  return out.length >= MIN_STORIES ? out : [];
}

function TopStoryCard({ story }: { story: TopStory }) {
  const [, navigate] = useLocation();
  const [imgFailed, setImgFailed] = useState(false);
  const { hit, news } = story;
  // News bots post headline + link, no picture — the article has one. Ask
  // the link-metadata proxy (RELAY-ASKS #7; a session breaker keeps this to
  // one request until the endpoint ships) and show what it returns.
  const [unfurledImage, setUnfurledImage] = useState<string | null>(null);
  useEffect(() => {
    if (news.imageUrl || !news.url) return;
    let alive = true;
    void fetchUnfurl(news.url).then((meta) => {
      if (alive && meta?.image) setUnfurledImage(meta.image);
    });
    return () => {
      alive = false;
    };
  }, [news.imageUrl, news.url]);
  const imageUrl = news.imageUrl ?? unfurledImage;
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
      {imageUrl && !imgFailed ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="aspect-[16/10] w-full object-cover bg-slate-100 dark:bg-slate-800"
          data-testid="story-image"
        />
      ) : (
        // Same footprint without a picture, so the strip stays one height.
        <div className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-brand-primary/10 to-brand-accent/10 dark:from-brand-primary/20 dark:to-brand-accent/15" aria-hidden="true">
          <Newspaper className="h-6 w-6 text-brand-primary/60" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col p-2.5">
        {news.domain && (
          <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
            <Favicon host={news.domain} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
            <span className="truncate">{news.domain}</span>
          </div>
        )}
        {news.url ? (
          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 line-clamp-3 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100 hover:text-brand-primary hover:underline"
          >
            {news.headline}
          </a>
        ) : (
          <p className="mt-1 line-clamp-3 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100">{news.headline}</p>
        )}
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

function MediaTile({ hit, score }: { hit: SearchHit; score?: number | null }) {
  const [, navigate] = useLocation();
  const openLightbox = useLightbox();
  const [imgFailed, setImgFailed] = useState(false);
  const e = hit.event;
  const url = mediaUrlOf(e);
  const isImage = !!url && IMAGE_RE.test(url);
  const poster = isImage ? url : (mediaPosterOf(e) ?? null);
  const isVideo = VIDEO_KINDS.has(e.kind) || (!!url && !isImage && isVideoUrl(e, url));
  const openPost = () => navigate(eventPath(e));
  // A tap on the picture or the play badge gives the MEDIA — full view,
  // playing — the way X, Instagram and TikTok do. The caption opens the post.
  // The full view is told whose it is and where the post lives.
  const context = {
    author: hit.author ? { name: getDisplayLabel(hit.author), npub: hit.author.npub, picture: hit.author.picture, score01: hit.author.wotRank ?? score ?? null } : null,
    postHref: eventPath(e),
  };
  const openMedia = () => {
    if (isVideo && url) openLightbox([{ url, kind: "video", poster }], 0, context);
    else if (poster) openLightbox([{ url: poster, kind: "image" }], 0, context);
    else openPost();
  };
  const caption = (e.content || tagVal(e, "title") || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return (
    <div
      className="group overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all"
      data-testid={`media-tile-${e.id}`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={isVideo ? "Play video" : "View image"}
        onClick={openMedia}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openMedia();
          }
        }}
        className="relative aspect-[4/3] cursor-pointer bg-slate-100 dark:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        data-testid="media-tile-media"
      >
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
      <div
        role="link"
        tabIndex={0}
        onClick={openPost}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            openPost();
          }
        }}
        className="cursor-pointer p-2 hover:bg-slate-50 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        data-testid="media-tile-caption"
      >
        {caption && <p className="line-clamp-2 text-[12px] leading-snug text-slate-700 dark:text-slate-200">{caption}</p>}
        <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">
          {hit.author ? getDisplayLabel(hit.author) : "Unknown"} · {ago(e.created_at)}
        </p>
      </div>
    </div>
  );
}

/** The Media tile grid — two across on phones, three on wider screens. */
export function MediaTiles({ hits, scoreOf }: { hits: SearchHit[]; scoreOf?: (pk: string) => number | null | undefined }) {
  if (hits.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="serp-media-grid">
      {hits.map((h) => (
        <MediaTile key={h.event.id} hit={h} score={scoreOf?.(h.event.pubkey)} />
      ))}
    </div>
  );
}

/** Events that have anything visual to tile — the rest stay rows. */
export function hasVisual(e: NostrEvent): boolean {
  return !!(mediaUrlOf(e) || mediaPosterOf(e));
}
