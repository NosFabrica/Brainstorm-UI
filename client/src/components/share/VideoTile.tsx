/**
 * A video tile for the profile page's Videos block and "More videos" under
 * a video: the poster when it loads, the video's own first frame when the
 * poster fails (expired CDN links are common), a quiet placeholder when
 * there is nothing to show — never a broken-image glyph. The tap is the
 * caller's: the profile opens the lightbox and plays the video in full
 * view (`onOpen`, a button named "Play …"). Where the tile leads to the
 * video's own page it is given `href` and is a link named by the title, so
 * a new tab and "copy link" work. A video its creator marked sensitive
 * (`warning`) is a "Sensitive" placeholder: no poster, no frame.
 *
 * The frame is the caller's to say (`shape`, wide when not told). What it
 * shows is fitted inside the frame on the dark ground, never cut to fill
 * it, so an upright short or a square Vine is seen whole.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Play, Video } from "lucide-react";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import type { ContentWarning } from "@/lib/nip36";
import type { VideoShape } from "@/lib/videoFrame";
import { SensitiveTile, sensitiveVideoLabel } from "@/components/share/SensitiveMedia";

const FRAME: Record<VideoShape, string> = {
  portrait: "aspect-[9/16]",
  square: "aspect-square",
  landscape: "aspect-video",
};

export function VideoTile({
  poster,
  url,
  onOpen,
  href,
  title,
  warning,
  shape = "landscape",
}: {
  poster?: string | null;
  url?: string | null;
  onOpen?: () => void;
  /** The video's own page. With it the tile is a link there, and `onOpen` is not used. */
  href?: string;
  title?: string;
  warning?: ContentWarning | null;
  shape?: VideoShape;
}) {
  const speed = useConnectionSpeed();
  const [posterFailed, setPosterFailed] = useState(false);
  const showPoster = !!poster && !posterFailed;
  const className = `group relative block w-full bg-slate-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${FRAME[shape]}`;
  const media = (
    <>
      {warning ? (
        <SensitiveTile className="absolute inset-0" />
      ) : showPoster ? (
        <img
          src={poster!}
          alt=""
          loading="lazy"
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
          data-testid="video-tile-poster"
        />
      ) : url ? (
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload={videoPreload(speed)}
          className="absolute inset-0 h-full w-full object-contain"
          data-testid="video-tile-frame"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900"
          data-testid="video-tile-placeholder"
        >
          <Video className="h-6 w-6 text-slate-500" aria-hidden="true" />
        </div>
      )}
      {!warning && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-all group-hover:scale-105 group-hover:bg-white">
            <Play className="ml-0.5 h-5 w-5 text-brand-deep" />
          </span>
        </div>
      )}
    </>
  );
  if (href)
    return (
      <Link
        href={href}
        aria-label={warning ? sensitiveVideoLabel(title) : title || "Video"}
        className={className}
        data-testid="share-video-tile"
      >
        {media}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={warning ? sensitiveVideoLabel(title) : title ? `Play ${title}` : "Play video"}
      className={className}
      data-testid="share-video-tile"
    >
      {media}
    </button>
  );
}
