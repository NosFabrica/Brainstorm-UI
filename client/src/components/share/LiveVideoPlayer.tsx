import { useEffect, useRef, useState } from "react";
import { Play, Loader2 } from "lucide-react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";

/**
 * A branded HLS live-video player. hls.js is dynamically imported (kept out of
 * the main bundle) and only loaded when the viewer hits play. Safari/iOS use
 * native HLS; everyone else uses hls.js. Native controls handle
 * fullscreen/PiP/volume on desktop + mobile. A fatal load error calls `onError`
 * so the parent can show a "watch externally" fallback.
 */
export function LiveVideoPlayer({ src, poster, onError }: { src: string; poster?: string; onError?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Keep the HLS stream feeding a PiP window across navigation; it's torn down
  // when the viewer closes PiP (onClose), or on unmount when NOT in PiP.
  usePipAwareAutoStop(videoRef, () => { try { hlsRef.current?.destroy(); } catch { /* ignore */ } });
  useEffect(() => () => {
    if (videoRef.current && document.pictureInPictureElement === videoRef.current) return;
    try { hlsRef.current?.destroy(); } catch { /* ignore */ }
  }, []);

  const start = async () => {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    setLoading(true);
    try {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src; // Safari / iOS native HLS
      } else {
        const Hls = (await import("hls.js")).default;
        if (!Hls.isSupported()) { setLoading(false); onError?.(); return; }
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal?: boolean }) => {
          if (data?.fatal) { setLoading(false); try { hls.destroy(); } catch { /* ignore */ } onError?.(); }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      }
      await video.play().catch(() => {});
      setLoading(false);
    } catch {
      setLoading(false);
      onError?.();
    }
  };

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-black" data-testid="live-player">
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        controls={started}
        className="h-full w-full object-contain"
        data-testid="live-video"
        onError={() => { if (started) onError?.(); }}
      />
      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label="Watch live"
          className="group absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
          data-testid="live-play"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform group-hover:scale-105">
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-brand-link" /> : <Play className="h-7 w-7 translate-x-0.5 fill-current text-brand-link" />}
          </span>
        </button>
      )}
    </div>
  );
}
