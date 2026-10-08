/**
 * A clip's first frame as a still — the thumbnail for a video with no poster,
 * or a dead one. The file is asked for only once the frame is near the
 * viewport (a <video> has no loading="lazy"), and then only its metadata on a
 * normal connection; on a slow one it stays an empty square until played.
 */
import { useRef } from "react";
import { useNearViewport } from "@/hooks/useNearViewport";
import { useConnectionSpeed, videoPreload } from "@/lib/connection";

/** Where the first frame is: the URL with its own fragment replaced by a time. */
export const firstFrameSrc = (url: string) => `${url.replace(/#.*$/, "")}#t=0.1`;

export function VideoFirstFrame({
  src,
  className,
  onClick,
  testId,
}: {
  src: string;
  className: string;
  onClick?: (e: React.MouseEvent) => void;
  testId?: string;
}) {
  const speed = useConnectionSpeed();
  const ref = useRef<HTMLVideoElement | null>(null);
  const near = useNearViewport(ref, "400px");
  return (
    <video
      ref={ref}
      src={near ? firstFrameSrc(src) : undefined}
      preload={videoPreload(speed)}
      muted
      playsInline
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={className}
      data-testid={testId}
    />
  );
}
