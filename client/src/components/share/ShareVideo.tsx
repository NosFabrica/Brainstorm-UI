import { useRef, useState } from "react";
import { Play } from "lucide-react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";

/**
 * A teaser video tile: shows the poster/first frame with a clean play overlay
 * and NO native control bar until the viewer plays it (click). Once playing,
 * native controls appear so they can scrub/pause/fullscreen.
 */
export function ShareVideo({ url, poster, title }: { url: string; poster?: string; title?: string }) {
  const speed = useConnectionSpeed();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  usePipAwareAutoStop(ref);

  const start = () => {
    setPlaying(true);
    ref.current?.play().catch(() => {});
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-800">
      <div className="relative aspect-video bg-black">
        <video
          ref={ref}
          src={url}
          poster={poster}
          playsInline
          preload={videoPreload(speed)}
          controls={playing}
          onPlay={() => setPlaying(true)}
          className="h-full w-full object-cover"
          data-testid="share-video-el"
        />
        {!playing && (
          <button
            type="button"
            onClick={start}
            aria-label={`Play ${title || "video"}`}
            className="group absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/20"
            data-testid="share-video-play"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-all group-hover:scale-105 group-hover:bg-white">
              <Play className="ml-0.5 h-5 w-5 text-brand-deep" />
            </span>
          </button>
        )}
      </div>
      {title && (
        <p className="truncate bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {title}
        </p>
      )}
    </div>
  );
}
