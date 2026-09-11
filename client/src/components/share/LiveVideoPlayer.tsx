import { useEffect, useRef, useState } from "react";
import { Play, Loader2, VolumeX } from "lucide-react";
import { usePipAwareAutoStop } from "@/lib/audioPlayer";

/**
 * A branded HLS live-video player. hls.js is dynamically imported (kept out of
 * the main bundle) and only loaded when the viewer hits play. Safari/iOS use
 * native HLS; everyone else uses hls.js. Native controls handle
 * fullscreen/PiP/volume on desktop + mobile. A fatal load error calls `onError`
 * so the parent can show a "watch externally" fallback.
 */
export function LiveVideoPlayer({
  src,
  poster,
  onError,
  autoStart = false,
  frameless = false,
}: {
  src: string;
  poster?: string;
  onError?: () => void;
  /** Start on mount — the stream page opened from a tile, or a caller whose
   *  own tap already said "play". Browsers allow sound once the viewer has
   *  clicked anywhere on the site; when they refuse, playback starts muted
   *  with an Unmute button, and only a refusal of that too waits for a tap. */
  autoStart?: boolean;
  /** No border or rounding of its own, for a caller that already frames it. */
  frameless?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hlsRef = useRef<any>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  // Started muted because the browser refused sound (a cold deep link, no tap
  // on the site yet); one Unmute button puts the sound back.
  const [muted, setMuted] = useState(false);

  // Keep the HLS stream feeding a PiP window across navigation; it's torn down
  // when the viewer closes PiP (onClose), or on unmount when NOT in PiP.
  usePipAwareAutoStop(videoRef, () => { try { hlsRef.current?.destroy(); } catch { /* ignore */ } });
  useEffect(() => () => {
    if (videoRef.current && document.pictureInPictureElement === videoRef.current) return;
    try { hlsRef.current?.destroy(); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (autoStart) void start();
    // Once, on mount: the intent was the caller's tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      try {
        await video.play();
      } catch (err) {
        if ((err as { name?: string })?.name !== "NotAllowedError") throw err;
        // Sound refused: Twitch's answer — start muted, offer one Unmute.
        video.muted = true;
        try {
          await video.play();
          setMuted(true);
        } catch {
          video.muted = false;
          setStarted(false);
        }
      }
      setLoading(false);
    } catch {
      setLoading(false);
      onError?.();
    }
  };

  const unmute = () => {
    const video = videoRef.current;
    if (video) video.muted = false;
    setMuted(false);
  };

  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-black ${frameless ? "" : "rounded-2xl border border-slate-200"}`} data-testid="live-player">
      <video
        ref={videoRef}
        poster={poster}
        playsInline
        controls={started}
        className="h-full w-full object-contain"
        data-testid="live-video"
        onError={() => { if (started) onError?.(); }}
      />
      {started && muted && (
        <button
          type="button"
          onClick={unmute}
          className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-md transition-transform hover:scale-105"
          data-testid="live-unmute"
        >
          <VolumeX className="h-4 w-4" /> Unmute
        </button>
      )}
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
