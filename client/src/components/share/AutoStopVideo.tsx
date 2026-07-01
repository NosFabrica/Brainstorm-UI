import { useRef, type VideoHTMLAttributes } from "react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";

/**
 * A drop-in `<video>` that hard-stops (pause + exit Picture-in-Picture) when it
 * unmounts, so navigating away always ends playback — even from a PiP window.
 * Used for inline note media that would otherwise keep playing audio after the
 * page is gone.
 */
export function AutoStopVideo(props: VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement>(null);
  usePipAwareAutoStop(ref);
  return <video ref={ref} {...props} />;
}
