/**
 * The media-rich pieces of the composed page, Google's anatomy: a Top
 * stories strip (image on top, source, headline, age) leading Latest, and a
 * tile grid for Media (photos as images, videos with a play badge and their
 * poster or first frame, captions with author and age). Both open the in-app
 * event page; a story's headline goes out to the article.
 */
import { useEffect, useState } from "react";
import { noteTitle } from "@/lib/noteTitle";
import { fetchUnfurl } from "@/services/unfurl";
import { isVideoFileUrl, youtubeThumbnail } from "@/lib/linkThumb";
import { useLocation } from "wouter";
import { BookOpen, Newspaper, Play } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { Favicon } from "@/components/share/LinkPreview";
import { useLightbox } from "@/components/share/Lightbox";
import { isVideoUrl, mediaPosterOf, mediaUrlOf, tagVal } from "@/components/search/cards";
import { parseNewsShape, type NewsShape } from "@/lib/newsShape";
import { eventPath } from "@/lib/shareId";
import { getDisplayLabel } from "@/lib/profileSearch";
import type { SearchHit } from "@/services/search";
import type { HitCluster } from "@/lib/searchCollapse";
import { useTierRing } from "@/components/score/VerificationCoin";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";

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
    // A picture may still ride in imeta / image tags rather than the text —
    // a picture, not the linked video file itself.
    const media = mediaUrlOf(hit.event);
    return news ? { ...news, imageUrl: media && IMAGE_RE.test(media) ? media : null } : null;
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
  // Free thumbnails first: YouTube's known address, or the video file itself.
  const derivedImage = news.url ? youtubeThumbnail(news.url) : null;
  const videoUrl = news.url && isVideoFileUrl(news.url) ? news.url : null;
  const [unfurledImage, setUnfurledImage] = useState<string | null>(null);
  useEffect(() => {
    if (news.imageUrl || derivedImage || videoUrl || !news.url) return;
    let alive = true;
    void fetchUnfurl(news.url).then((meta) => {
      if (alive && meta?.image) setUnfurledImage(meta.image);
    });
    return () => {
      alive = false;
    };
  }, [news.imageUrl, news.url, derivedImage, videoUrl]);
  const imageUrl = news.imageUrl ?? derivedImage ?? unfurledImage;
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
      ) : videoUrl ? (
        // The link is the video: its first frame is the thumbnail.
        <video src={`${videoUrl}#t=0.1`} muted playsInline preload="metadata" className="aspect-[16/10] w-full object-cover bg-black" data-testid="story-video" />
      ) : (
        // Same footprint without a picture, so the strip stays one height.
        // Google News' move when an article has no image: the outlet's logo.
        // (The article's own image arrives once the link-metadata proxy ships.)
        <div
          className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-brand-primary/10 to-brand-accent/10 dark:from-brand-primary/20 dark:to-brand-accent/15"
          aria-hidden="true"
          data-testid="story-placeholder"
        >
          {news.domain ? (
            <>
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10">
                <Favicon host={news.domain} className="h-8 w-8 rounded-md object-contain" />
              </span>
              <span className="max-w-[85%] truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{news.domain}</span>
            </>
          ) : (
            <Newspaper className="h-6 w-6 text-brand-primary/60" />
          )}
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
            rel="noopener"
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

function MediaTile({ hit, score, onGone }: { hit: SearchHit; score?: number | null; /** The media no longer answers — the tile should leave the grid. */ onGone?: () => void }) {
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
  const caption = noteTitle(e.content || tagVal(e, "title") || "", 160);
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
        {/* Dead media leaves the grid (Google's rule for a broken image): a
            poster that fails falls back to the video's first frame when there
            is one; when that fails too — or a picture alone fails — the tile
            tells the grid it is gone. */}
        {poster && !imgFailed ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            onError={() => {
              setImgFailed(true);
              if (!(url && isVideo)) onGone?.();
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : url && isVideo ? (
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden onError={() => onGone?.()} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
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
  // Tiles whose media no longer answers (a dead CDN, a deleted bucket) leave
  // the grid, so it reflows without holes.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const shown = hits.filter((h) => !gone.has(h.event.id));
  if (shown.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="serp-media-grid">
      {shown.map((h) => (
        <MediaTile key={h.event.id} hit={h} score={scoreOf?.(h.event.pubkey)} onGone={() => setGone((prev) => new Set(prev).add(h.event.id))} />
      ))}
    </div>
  );
}

/** Events that have anything visual to tile — the rest stay rows. */
export function hasVisual(e: NostrEvent): boolean {
  return !!(mediaUrlOf(e) || mediaPosterOf(e));
}


/* ------------------------------------------------------------------ */
/* Articles as a bento                                                 */
/* ------------------------------------------------------------------ */

/** A long-form event's face: title, summary, picture, from its tags. */
/** An article with a cover image belongs in the picture grid; one without is a row. */
export function hasCover(e: NostrEvent): boolean {
  return !!tagVal(e, "image");
}

function articleShape(e: NostrEvent) {
  return {
    title: tagVal(e, "title") ?? "Untitled",
    summary: tagVal(e, "summary") ?? "",
    image: tagVal(e, "image") ?? null,
  };
}

function ArticleAuthor({ hit, score, light = false }: { hit: SearchHit; score?: number | null; light?: boolean }) {
  const tierRing = useTierRing();
  return (
    <span className={`flex items-center gap-1.5 min-w-0 text-[11px] ${light ? "text-white/85" : "text-slate-500 dark:text-slate-400"}`}>
      <Avatar className={`h-4 w-4 shrink-0 border border-white/60 ${tierRing(score ?? null, false, "sm", true) ?? ""}`}>
        {hit.author?.picture ? <AvatarImage src={hit.author.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{hit.author ? getDisplayLabel(hit.author) : "Unknown"}</span>
      <span className="shrink-0 opacity-80">· {ago(hit.event.created_at)}</span>
    </span>
  );
}

function ArticlePicture({ src, className, placeholderClass }: { src: string | null; className: string; placeholderClass: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={className} data-testid="article-image" />;
  }
  return (
    <div className={`${placeholderClass} flex items-center justify-center bg-gradient-to-br from-brand-primary/15 to-brand-accent/15 dark:from-brand-primary/25 dark:to-brand-accent/20`} aria-hidden="true" data-testid="article-placeholder">
      <BookOpen className="h-6 w-6 text-brand-primary/60" />
    </div>
  );
}

function openable(open: () => void) {
  return {
    role: "link" as const,
    tabIndex: 0,
    onClick: open,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        open();
      }
    },
  };
}

/**
 * Articles as a bento (Benjamin: "make the images bigger… a nice break-up
 * within the feed"): the first article leads with a big picture, title and
 * summary; up to three more sit beside it as picture tiles. On phones the
 * lead is full-width and the tiles pair up beneath it.
 */
export function ArticlesBento({
  clusters,
  scoreOf,
}: {
  clusters: HitCluster[];
  scoreOf: (pk: string) => number | null | undefined;
}) {
  const [, navigate] = useLocation();
  const [lead, ...rest] = clusters;
  if (!lead) return null;
  const tiles = rest.slice(0, 3);
  const leadShape = articleShape(lead.primary.event);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="articles-bento">
      <div
        {...openable(() => navigate(eventPath(lead.primary.event)))}
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 col-span-2 sm:row-span-2"
        data-testid={`article-lead-${lead.primary.event.id}`}
      >
        <ArticlePicture src={leadShape.image} className="aspect-[16/9] w-full object-cover bg-slate-100 dark:bg-slate-800" placeholderClass="aspect-[16/9] w-full" />
        <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
          <ArticleAuthor hit={lead.primary} score={scoreOf(lead.primary.event.pubkey)} />
          <h3 className="mt-1.5 text-base font-semibold leading-snug text-slate-900 dark:text-slate-100 group-hover:text-brand-primary transition-colors line-clamp-2 sm:text-lg">
            {leadShape.title}
          </h3>
          {leadShape.summary && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-3">{leadShape.summary}</p>
          )}
        </div>
      </div>
      {tiles.map((c) => {
        const shape = articleShape(c.primary.event);
        return (
          <div
            key={c.primary.event.id}
            {...openable(() => navigate(eventPath(c.primary.event)))}
            className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 hover:border-slate-200 dark:hover:border-slate-800 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
            data-testid={`article-tile-${c.primary.event.id}`}
          >
            <ArticlePicture src={shape.image} className="aspect-[16/10] w-full object-cover bg-slate-100 dark:bg-slate-800" placeholderClass="aspect-[16/10] w-full" />
            <div className="flex min-w-0 flex-1 flex-col p-2.5">
              <p className="text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100 group-hover:text-brand-primary transition-colors line-clamp-2">{shape.title}</p>
              <div className="mt-auto pt-1.5">
                <ArticleAuthor hit={c.primary} score={scoreOf(c.primary.event.pubkey)} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
