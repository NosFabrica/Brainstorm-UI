import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";
import { useAutoplayInView } from "@/lib/feedVideo";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";
import { videoFrameStyle, videoShapeOf, type VideoDim } from "@/lib/videoFrame";

/** The tallest a frame gets, in rem: `max-h-[34rem]` for a video whose size is not known. */
const MAX_HEIGHT_REM = 34;

/**
 * An inline note video that behaves like X: it autoplays **muted** when it
 * scrolls ≥60% into view, pauses when it leaves, and only one plays at a time.
 * Tap the video (or the speaker button) to unmute — that reveals native controls
 * for scrubbing/fullscreen. Users with "reduce motion" enabled never get
 * autoplay; they see a click-to-play poster instead. Auto-stops on unmount and
 * is Picture-in-Picture aware, like the rest of our media.
 *
 * `autoFocus` moves focus to the video as it appears, for the one case where
 * the reader has just asked for it ("Show video" on a sensitive cover).
 *
 * `dim` is the size a video event's imeta gives: the frame takes that shape
 * (upright, square or wide) at once, no taller than the one frame a video of
 * unknown size gets, so nothing jumps when the file loads. `loop` is for a
 * short.
 */
export function FeedVideo({
  src,
  poster,
  className,
  autoFocus = false,
  dim,
  loop = false,
}: {
  src: string;
  poster?: string;
  className?: string;
  autoFocus?: boolean;
  dim?: VideoDim;
  loop?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
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

  // With reduced motion the video waits under a play button: that is what to focus.
  useEffect(() => {
    if (autoFocus) (playButton.current ?? ref.current)?.focus();
    // Once, as it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const speed = useConnectionSpeed();
  // A poor connection gets a poster and a play button, never an autoplaying clip.
  useAutoplayInView(ref, !reduce && speed === "normal");

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

  const shell = `relative mt-2 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-black ${className ?? ""}`;
  // With a size, the frame is the shape and the video fills it; without, the video sizes the frame.
  const frame = videoFrameStyle(dim, MAX_HEIGHT_REM);
  const shape = videoShapeOf(dim) ?? undefined;
  const fit = frame ? "absolute inset-0 h-full w-full object-contain" : "max-h-[34rem] w-full object-contain";

  // Reduced-motion: no autoplay — a clean click-to-play poster.
  if (reduce && !started) {
    return (
      <div className={shell} style={frame} data-shape={shape}>
        <video
          ref={ref}
          src={src}
          poster={poster}
          playsInline
          loop={loop}
          preload={videoPreload(speed)}
          className={fit}
        />
        <button
          ref={playButton}
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
    <div className={shell} style={frame} data-shape={shape} data-testid="feed-video">
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        loop={loop}
        preload={videoPreload(speed)}
        tabIndex={autoFocus ? 0 : undefined}
        controls={controls}
        onClick={() => {
          if (muted) unmute();
        }}
        className={`${fit} cursor-pointer`}
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
