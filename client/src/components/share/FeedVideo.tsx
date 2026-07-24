import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";
import { useAutoplayInView, usePrefersReducedMotion } from "@/lib/feedVideo";

/**
 * An inline note video that behaves like X: it autoplays **muted** when it
 * scrolls ≥60% into view, pauses when it leaves, and only one plays at a time.
 * Tap the video (or the speaker button) to unmute — that reveals native controls
 * for scrubbing/fullscreen. Users with "reduce motion" enabled never get
 * autoplay; they see a click-to-play poster instead. Auto-stops on unmount and
 * is Picture-in-Picture aware, like the rest of our media.
 */
export function FeedVideo({ src, poster, className }: { src: string; poster?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  usePipAwareAutoStop(ref);
  const reduce = usePrefersReducedMotion();
  const [started, setStarted] = useState(false); // reduce-motion click-to-play gate
  const [muted, setMuted] = useState(true);
  const [controls, setControls] = useState(false);

  // Keep the element muted at the DOM level so the browser allows autoplay
  // (React's `muted` attribute is unreliable for this).
  useEffect(() => {
    if (ref.current) ref.current.muted = true;
  }, []);

  useAutoplayInView(ref, !reduce);

  const unmute = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    setMuted(false);
    setControls(true);
    v.play().catch(() => {});
  };
  const toggleMute = () => {
    const v = ref.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    if (!next) {
      setControls(true);
      v.play().catch(() => {});
    }
  };
  const startReduced = () => {
    const v = ref.current;
    if (!v) return;
    setStarted(true);
    v.muted = false;
    setMuted(false);
    setControls(true);
    v.play().catch(() => {});
  };

  const shell = `relative mt-2 overflow-hidden rounded-xl border border-slate-200 bg-black ${className ?? ""}`;

  // Reduced-motion: no autoplay — a clean click-to-play poster.
  if (reduce && !started) {
    return (
      <div className={shell}>
        <video ref={ref} src={src} poster={poster} playsInline preload="metadata" className="w-full max-h-[34rem] object-contain" />
        <button
          type="button"
          onClick={startReduced}
          aria-label="Play video"
          className="group absolute inset-0 flex items-center justify-center bg-black/15 transition-colors hover:bg-black/25"
          data-testid="feed-video-play"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
            <Play className="h-6 w-6 translate-x-0.5 fill-current text-brand-link" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={shell} data-testid="feed-video">
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        controls={controls}
        onClick={() => { if (muted) unmute(); }}
        className="w-full max-h-[34rem] cursor-pointer object-contain"
        data-testid="feed-video-el"
      />
      {!controls && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
          data-testid="feed-video-mute"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
