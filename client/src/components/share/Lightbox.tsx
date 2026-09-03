import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * X-style media lightbox. Any component can open it via {@link useLightbox}
 * with a list of items + the index to start on — plain URL strings are
 * images; `{ url, kind: "video", poster }` plays a clip full view with
 * controls, starting at once (Benjamin: a tap on media gives the media, the
 * way X, Instagram and TikTok do — never the post). A single shared overlay
 * renders at the app root: fullscreen dark backdrop, the media centered,
 * arrow + swipe navigation through the set, and a counter. Close via the X
 * button, a backdrop tap, or Esc. Desktop + mobile friendly.
 */
export type LightboxItem = string | { url: string; kind: "image" | "video"; poster?: string | null };
type MediaItem = { url: string; kind: "image" | "video"; poster: string | null };
type LightboxState = { images: MediaItem[]; index: number } | null;

const LightboxContext = createContext<(items: LightboxItem[], index: number) => void>(() => {});

export function useLightbox() {
  return useContext(LightboxContext);
}

function normalize(items: LightboxItem[]): MediaItem[] {
  return items
    .map((it) => (typeof it === "string" ? { url: it, kind: "image" as const, poster: null } : { url: it.url, kind: it.kind, poster: it.poster ?? null }))
    .filter((it) => !!it.url);
}

export function LightboxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LightboxState>(null);

  const open = useCallback((items: LightboxItem[], index: number) => {
    const imgs = normalize(items);
    if (!imgs.length) return;
    setState({ images: imgs, index: Math.max(0, Math.min(index, imgs.length - 1)) });
  }, []);

  return (
    <LightboxContext.Provider value={open}>
      {children}
      {state && <LightboxOverlay state={state} setState={setState} onClose={() => setState(null)} />}
    </LightboxContext.Provider>
  );
}

function LightboxOverlay({
  state,
  setState,
  onClose,
}: {
  state: { images: MediaItem[]; index: number };
  setState: (s: LightboxState) => void;
  onClose: () => void;
}) {
  const { images, index } = state;
  const multi = images.length > 1;
  const touchX = useRef<number | null>(null);

  const go = useCallback(
    (dir: 1 | -1) => {
      setState({ images, index: (index + dir + images.length) % images.length });
    },
    [images, index, setState],
  );

  // Keyboard: Esc closes, arrows navigate. Lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && multi) go(1);
      else if (e.key === "ArrowLeft" && multi) go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [multi, go, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || !multi) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 select-none"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      data-testid="lightbox"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="Close"
        data-testid="lightbox-close"
      >
        <X className="h-5 w-5" />
      </button>

      {multi && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white tabular-nums" data-testid="lightbox-counter">
          {index + 1} / {images.length}
        </div>
      )}

      {multi && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 hidden sm:grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Previous"
            data-testid="lightbox-prev"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 hidden sm:grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Next"
            data-testid="lightbox-next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {images[index].kind === "video" ? (
        <video
          key={images[index].url}
          src={images[index].url}
          poster={images[index].poster ?? undefined}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] max-w-[96vw] rounded-lg bg-black shadow-2xl"
          data-testid="lightbox-video"
        />
      ) : (
        <img
          key={images[index].url}
          src={images[index].url}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-[92vh] max-w-[96vw] object-contain rounded-lg shadow-2xl"
          data-testid="lightbox-image"
        />
      )}
    </div>,
    document.body,
  );
}
