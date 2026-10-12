/**
 * A video tile for the profile page's Videos block: the poster when it
 * loads, the video's own first frame when the poster fails (expired CDN
 * links are common), a quiet placeholder when there is nothing to show —
 * never a broken-image glyph. The tap is the caller's: the page opens the
 * lightbox and plays the video in full view. A video its creator marked
 * sensitive (`warning`) is a "Sensitive" placeholder: no poster, no frame.
 */
import { useState } from "react";
import { Play, Video } from "lucide-react";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import type { ContentWarning } from "@/lib/nip36";
import { SensitiveTile, sensitiveVideoLabel } from "@/components/share/SensitiveMedia";

export function VideoTile({
  poster,
  url,
  onOpen,
  title,
  warning,
}: {
  poster?: string | null;
  url?: string | null;
  onOpen: () => void;
  title?: string;
  warning?: ContentWarning | null;
}) {
  const speed = useConnectionSpeed();
  const [posterFailed, setPosterFailed] = useState(false);
  const showPoster = !!poster && !posterFailed;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={warning ? sensitiveVideoLabel(title) : title ? `Play ${title}` : "Play video"}
      className="group relative block aspect-video w-full bg-slate-900 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
      data-testid="share-video-tile"
    >
      {warning ? (
        <SensitiveTile className="absolute inset-0" />
      ) : showPoster ? (
        <img
          src={poster!}
          alt=""
          loading="lazy"
          onError={() => setPosterFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          data-testid="video-tile-poster"
        />
      ) : url ? (
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload={videoPreload(speed)}
          className="absolute inset-0 h-full w-full object-cover"
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
    </button>
  );
}
