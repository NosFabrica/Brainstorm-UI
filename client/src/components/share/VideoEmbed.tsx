import { useState, type MouseEvent } from "react";
import { LinkChip } from "@/components/share/LinkPreview";

/**
 * Inline, click-to-play player for hosted video (YouTube, Vimeo). Renders a
 * lightweight facade — a poster + play button — and only loads the provider's
 * iframe once the user hits play, so the page stays fast and makes no request
 * to YouTube/Vimeo until intended (privacy-aligned; YouTube uses the -nocookie
 * host). Plays in-page like a top-tier client instead of bouncing out to the
 * source site.
 *
 * Built entirely from phrasing-content tags (span/button/img/iframe, no <div>)
 * so it's valid inside a Markdown <p> — it drops straight into an article body
 * as well as a note.
 */
export interface VideoEmbedInfo { kind: "youtube" | "vimeo"; id: string; }

export function videoEmbedFor(raw: string): VideoEmbedInfo | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? { kind: "youtube", id } : null;
  }
  if (host.endsWith("youtube.com")) {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id ? { kind: "youtube", id } : null;
    }
    const m = u.pathname.match(/^\/(?:embed|shorts|v|live)\/([^/?#]+)/);
    return m ? { kind: "youtube", id: m[1] } : null;
  }
  if (host === "vimeo.com") {
    const m = u.pathname.match(/^\/(\d+)/);
    return m ? { kind: "vimeo", id: m[1] } : null;
  }
  if (host === "player.vimeo.com") {
    const m = u.pathname.match(/\/video\/(\d+)/);
    return m ? { kind: "vimeo", id: m[1] } : null;
  }
  return null;
}

export function VideoEmbed({ url, className = "" }: { url: string; className?: string }) {
  const info = videoEmbedFor(url);
  const [playing, setPlaying] = useState(false);
  if (!info) return <LinkChip url={url} />;

  const src = info.kind === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${info.id}?autoplay=1&rel=0&modestbranding=1`
    : `https://player.vimeo.com/video/${info.id}?autoplay=1`;
  const thumb = info.kind === "youtube" ? `https://img.youtube.com/vi/${info.id}/hqdefault.jpg` : null;
  const label = info.kind === "youtube" ? "YouTube" : "Vimeo";

  const play = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); setPlaying(true); };

  return (
    <span
      className={`my-3 block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 ${className}`}
      data-noopen
      data-testid="video-embed"
    >
      <span className="relative block aspect-video">
        {playing ? (
          <iframe
            src={src}
            title={`${label} video player`}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <button type="button" onClick={play} className="group absolute inset-0 h-full w-full cursor-pointer border-0 p-0" aria-label={`Play ${label} video`}>
            {thumb
              ? <img src={thumb} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              : <span className="absolute inset-0 bg-gradient-to-br from-brand-primary to-brand-accent" />}
            <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/10" />
            <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-150 group-hover:scale-105">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-0.5 h-6 w-6" style={{ fill: "rgb(var(--brand-primary))" }}><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">{label}</span>
          </button>
        )}
      </span>
    </span>
  );
}
