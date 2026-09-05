import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "wouter";
import { ArrowUpRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useTierRing } from "@/components/score/VerificationCoin";
import { LiveVideoPlayer } from "@/components/share/LiveVideoPlayer";

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
/** `hls` is a live or recorded HLS stream through our player; `embed` a platform player's page URL (YouTube, Twitch…). */
export type LightboxItem = string | { url: string; kind: "image" | "video" | "hls" | "embed"; poster?: string | null };
/** Who the media is from and where the post lives — the quiet bar in full view. */
export type LightboxContextInfo = {
  author?: { name: string; npub: string; picture?: string | null; score01?: number | null } | null;
  postHref?: string | null;
};
type MediaItem = { url: string; kind: "image" | "video" | "hls" | "embed"; poster: string | null };
type LightboxState = { images: MediaItem[]; index: number; context: LightboxContextInfo | null } | null;

const LightboxContext = createContext<(items: LightboxItem[], index: number, context?: LightboxContextInfo) => void>(() => {});

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

  const open = useCallback((items: LightboxItem[], index: number, context?: LightboxContextInfo) => {
    const imgs = normalize(items);
    if (!imgs.length) return;
    setState({ images: imgs, index: Math.max(0, Math.min(index, imgs.length - 1)), context: context ?? null });
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
  state: { images: MediaItem[]; index: number; context: LightboxContextInfo | null };
  setState: (s: LightboxState) => void;
  onClose: () => void;
}) {
  const { images, index, context } = state;
  const multi = images.length > 1;
  const touchX = useRef<number | null>(null);
  const tierRing = useTierRing();

  const go = useCallback(
    (dir: 1 | -1) => {
      setState({ images, index: (index + dir + images.length) % images.length, context });
    },
    [images, index, context, setState],
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

      {images[index].kind === "hls" ? (
        // A stream, live or recorded: our HLS player, starting at once — the
        // same full view a clip gets, so a replay in the rail expands like a video.
        <div key={images[index].url} onClick={(e) => e.stopPropagation()} className="w-[96vw] max-w-5xl overflow-hidden rounded-lg bg-black shadow-2xl" data-testid="lightbox-hls">
          <LiveVideoPlayer src={images[index].url} poster={images[index].poster ?? undefined} autoStart frameless />
        </div>
      ) : images[index].kind === "embed" ? (
        <div key={images[index].url} onClick={(e) => e.stopPropagation()} className="aspect-video w-[96vw] max-w-5xl overflow-hidden rounded-lg bg-black shadow-2xl">
          <iframe
            src={images[index].url}
            title="Stream"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            className="h-full w-full"
            data-testid="lightbox-embed"
          />
        </div>
      ) : images[index].kind === "video" ? (
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

      {/* Whose media, and the way onward — a quiet bar, X's anatomy: the
          poster's ringed face and name to their profile, "View post" to the
          post. Either closes the full view. */}
      {(context?.author || context?.postHref) && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-10 sm:px-6"
          onClick={(e) => e.stopPropagation()}
          data-testid="lightbox-attribution"
        >
          {context.author ? (
            <Link
              href={`/p/${context.author.npub}`}
              onClick={onClose}
              className="group flex min-w-0 items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <Avatar className={`h-8 w-8 border border-white/20 ${tierRing(context.author.score01 ?? null, false, "sm", true) ?? ""}`}>
                {context.author.picture ? <AvatarImage src={context.author.picture} alt="" className="object-cover" /> : null}
                <AvatarFallback className="overflow-hidden">
                  <DefaultAvatarImg />
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-sm font-semibold text-white group-hover:underline">{context.author.name}</span>
            </Link>
          ) : (
            <span />
          )}
          {context.postHref && (
            <Link
              href={context.postHref}
              onClick={onClose}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              data-testid="lightbox-view-post"
            >
              View post <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
