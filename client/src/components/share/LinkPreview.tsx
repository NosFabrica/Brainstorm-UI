import { useEffect, useRef, useState } from "react";
import { ExternalLink, Globe } from "lucide-react";
import { WavlakeTrackCard } from "@/components/share/WavlakeTrackCard";
import { FountainCard } from "@/components/share/FountainCard";
import { wavlakeTrackId } from "@/lib/wavlake";
import { VideoEmbed } from "@/components/share/VideoEmbed";
import { fetchUnfurl, type Unfurled } from "@/services/unfurl";
import { useLightbox } from "@/components/share/Lightbox";
import { FeedVideo } from "@/components/share/FeedVideo";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useConnectionSpeed } from "@/lib/connection";
import { isEchoed } from "@/lib/echoedText";

/**
 * Link previews for a note's links. A browser can't read another site's Open
 * Graph tags (CORS), so plain links ask our own origin's `/link-preview`, served
 * by brainstorm_og — which identifies itself honestly, honours robots.txt and
 * doesn't log the URLs it's asked about. YouTube, Wavlake and Fountain need no
 * server: they play inline. Favicons and preview images load straight from the
 * linked site, images without a referrer; no third-party icon service.
 */

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** `/favicon.ico` on the host, then its apex when the link said www. No
 *  third-party icon service. `/favicon.png` was dropped: across a sample of
 *  real hosts it never rescued one whose `.ico` failed, and each miss is a
 *  failed request in every reader's network log. */
function faviconCandidates(host: string): string[] {
  const hosts = [host];
  const apex = host.replace(/^www\./i, "");
  if (apex !== host) hosts.push(apex);
  return hosts.map((h) => `https://${h}/favicon.ico`);
}

/** Per host for the session: the icon URL that loaded, or null when none did.
 *  Without it every chip for the same site walks — and fails — the same URLs. */
const faviconByHost = new Map<string, string | null>();

/** Test seam. */
export function __resetFavicons(): void {
  faviconByHost.clear();
}

/** Favicon loaded directly from the site; the globe once every candidate failed. */
export function Favicon({ host, className }: { host: string; className?: string }) {
  const known = host ? faviconByHost.get(host) : null;
  const candidates = known ? [known] : host && known === undefined ? faviconCandidates(host) : [];
  const [attempt, setAttempt] = useState(0);
  if (attempt >= candidates.length) return <Globe className={className} data-testid="favicon-globe" />;
  const src = candidates[attempt];
  return (
    <img
      key={src}
      src={src}
      alt=""
      loading="lazy"
      onLoad={() => faviconByHost.set(host, src)}
      onError={() => {
        if (attempt + 1 >= candidates.length) faviconByHost.set(host, null);
        setAttempt((a) => a + 1);
      }}
      className={className}
      data-testid="favicon"
    />
  );
}

/** Compact inline link: favicon + domain. Replaces a bare blue URL in text. */
export function LinkChip({ url }: { url: string }) {
  const u = parse(url);
  const host = u?.hostname.replace(/^www\./, "") || url;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 align-middle text-[13px] font-medium text-brand-link no-underline hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      data-testid="link-chip"
    >
      <Favicon host={u?.hostname || ""} className="h-3.5 w-3.5 rounded-sm shrink-0 object-contain" />
      <span className="truncate">{host}</span>
    </a>
  );
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.slice(1) || null;
  if (host.endsWith("youtube.com")) return u.searchParams.get("v");
  return null;
}

/**
 * The rich preview for a note's primary link. `showImage={false}` when the surrounding note or row already shows its own
 * picture: news posts often attach the article's image, and the card's
 * og:image would be the same picture twice. `context` is the text already on
 * screen: a title or description it already says is dropped, so a feed bot's
 * headline + link doesn't render the headline twice.
 */
export function LinkPreviewCard({ url, showImage = true, context }: { url: string; showImage?: boolean; context?: string }) {
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");
  const yt = youtubeId(u);

  // Audio plays where it is too: Wavlake's catalogue gives the track back as an
  // inline player.
  if (wavlakeTrackId(url)) return <WavlakeTrackCard url={url} />;
  // Fountain's page is CORS-readable and carries artwork, words and the mp3 in
  // Open Graph, so an episode is a rich card that plays here (FountainCard),
  // falling back to a plain link when the page cannot be read.
  if (host === "fountain.fm") return <FountainCard url={url} />;

  if (yt) {
    // A video plays where it is. The facade costs YouTube nothing until play;
    // the caption keeps the site itself one click away for whoever wants it.
    return (
      <div className="mt-2" data-testid="link-card-youtube">
        <VideoEmbed url={url} className="!my-0 rounded-b-none" />
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 rounded-b-xl border border-t-0 border-slate-200 dark:border-slate-800 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white/80 no-underline hover:text-white"
          data-testid="link-card-youtube-source"
        >
          YouTube · {host} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  // Plain links: a card when the preview service has something to show;
  // otherwise nothing, and the inline chip speaks for the link.
  return <UnfurledCard url={url} host={host} showImage={showImage} context={context} />;
}

/** Start asking a little before the card is read, so it is usually filled. */
const PREVIEW_NEAR_VIEWPORT = "400px";

/** A title that is only the site's own name ("NostrMag" on nostrmag.com) says nothing. */
function isJustTheSiteName(title: string, host: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = norm(title);
  return !t || norm(host.replace(/^www\./, "")).startsWith(t);
}

/**
 * The card for a plain link. It appears only once there is something worth
 * showing — a description, an image, or a real title. Otherwise nothing: the
 * inline chip already names the link, and an empty box repeating it is worse
 * than the card popping in when a real answer lands.
 */
function UnfurledCard({ url, host, showImage, context }: { url: string; host: string; showImage: boolean; context?: string }) {
  const openLightbox = useLightbox();
  const [fetched, setMeta] = useState<Unfurled | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  // Nothing is drawn until there is an answer, so a zero-height marker is
  // what gets observed. Only ask for the links a reader actually scrolls to.
  const ref = useRef<HTMLSpanElement | null>(null);
  // On a poor connection the inline chip speaks for the link; a preview is a
  // second fetch and a picture for something already named.
  const scrolledTo = useNearViewport(ref, PREVIEW_NEAR_VIEWPORT);
  const speed = useConnectionSpeed();
  const near = scrolledTo && speed === "normal";

  useEffect(() => {
    if (!near) return;
    let alive = true;
    setMeta(null);
    setImgFailed(false);
    void fetchUnfurl(url).then((m) => {
      if (alive) setMeta(m);
    });
    return () => {
      alive = false;
    };
  }, [url, near]);

  // The link is itself a clip: play it like any video in a note.
  if (fetched?.kind === "video") {
    return (
      <div className="mt-2" data-testid="link-video">
        <FeedVideo src={url} />
      </div>
    );
  }

  // The link is itself a picture: show it. If it fails to load, fall back to
  // the card as if nothing was known.
  if (fetched?.kind === "image" && fetched.image && !imgFailed) {
    const src = fetched.image;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openLightbox([src], 0);
        }}
        className="mt-2 block max-w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
        data-testid="link-image"
      >
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="max-h-64 max-w-full object-contain bg-slate-100 dark:bg-slate-800"
        />
      </button>
    );
  }

  const meta = fetched && fetched.kind !== "image" ? fetched : null;
  const image = showImage && meta?.image && !imgFailed ? meta.image : null;
  const title = meta?.title && !isJustTheSiteName(meta.title, host) ? meta.title : null;
  if (!meta || !(title || meta.description || image)) {
    return <span ref={ref} aria-hidden className="block h-0" data-testid="link-card-pending" />;
  }
  const siteName = meta.siteName ?? null;
  const source = (
    <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
      <Favicon host={host} className="h-3 w-3 shrink-0 rounded-sm object-contain" />
      <span className="truncate">
        {siteName ?? host}
        {siteName && siteName.toLowerCase() !== host.toLowerCase() ? ` \u00b7 ${host}` : ""}
      </span>
    </span>
  );
  // Only what the note hasn't already said.
  const newTitle = title && !isEchoed(title, context) ? title : null;
  const newDescription = meta.description && !isEchoed(meta.description, context) ? meta.description : null;

  if (!newTitle && !newDescription) {
    // The words are all on screen already. With a picture, the card is the
    // picture and where it leads; without one, a quiet line to the source.
    if (image) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 block max-w-md overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 no-underline hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          data-testid="link-card-media"
        >
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="aspect-[1.91/1] w-full object-cover bg-slate-100 dark:bg-slate-800"
            data-testid="link-card-image"
          />
          <span className="flex items-center gap-1 px-3 py-1.5">
            {source}
            <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
          </span>
        </a>
      );
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener"
        onClick={(e) => e.stopPropagation()}
        className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md py-0.5 no-underline hover:underline"
        data-testid="link-card-source"
      >
        {source}
        <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 flex items-stretch gap-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 no-underline hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all ${image ? "h-24" : ""}`}
      data-testid="link-card"
      // h-24 = 96px holds py-2 16 + meta 16 + title 2x20 + desc 1x16 + gaps 4 = 92. Clamps and leadings are the budget.
    >
      {image && (
        // Whoever posted the link chose this host, so it learns the reader's
        // IP either way — it does not also get to learn what they were reading.
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-32 shrink-0 object-cover bg-slate-100 dark:bg-slate-800"
          data-testid="link-card-image"
        />
      )}
      <div className={`flex min-w-0 flex-1 flex-col justify-center py-2 pr-3 ${image ? "pl-1" : "pl-3"}`}>
        {source}
        {newTitle && (
          <span className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-slate-900 dark:text-slate-100">
            {newTitle}
          </span>
        )}
        {newDescription && (
          // Without a title the lede gets the title's two lines.
          <span className={`mt-0.5 text-xs leading-4 text-slate-600 dark:text-slate-300 ${newTitle ? "line-clamp-1" : "line-clamp-2"}`}>
            {newDescription}
          </span>
        )}
      </div>
    </a>
  );
}
