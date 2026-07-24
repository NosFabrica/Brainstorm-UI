import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";

/**
 * A teaser video tile: shows the poster/first frame with a clean play overlay
 * and NO native control bar until the viewer plays it (click). Once playing,
 * native controls appear so they can scrub/pause/fullscreen.
 */
export function ShareVideo({ url, poster, title }: { url: string; poster?: string; title?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  usePipAwareAutoStop(ref);

  const start = () => {
    setPlaying(true);
    ref.current?.play().catch(() => {});
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-black">
      <div className="relative aspect-video bg-black">
        <video
          ref={ref}
          src={url}
          poster={poster}
          playsInline
          preload="metadata"
          controls={playing}
          onPlay={() => setPlaying(true)}
          className="w-full h-full object-cover"
          data-testid="share-video-el"
        />
        {!playing && (
          <button
            type="button"
            onClick={start}
            aria-label={`Play ${title || "video"}`}
            className="group absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
            data-testid="share-video-play"
          >
            <span className="h-12 w-12 rounded-full bg-white/90 group-hover:bg-white flex items-center justify-center shadow-lg transition-all group-hover:scale-105">
              <Play className="h-5 w-5 text-brand-deep ml-0.5" />
            </span>
          </button>
        )}
      </div>
      {title && <p className="px-3 py-2 text-xs font-semibold text-slate-700 truncate bg-white">{title}</p>}
    </div>
  );
}
