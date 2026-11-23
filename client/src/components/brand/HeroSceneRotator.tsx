import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { HERO_SCENES, type HeroScene } from "@/lib/heroScenes";

/**
 * Observe the `.dark` class on <html> (Tailwind darkMode: "class"). Decoupled
 * from ThemeProvider so this brand component works on any surface, and reactive
 * so a live theme toggle swaps the photography immediately.
 */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

/**
 * Remember the scene last shown by ANY rotator, in sessionStorage so it survives
 * a real navigation (homepage → /login), not just client-side routing. The next
 * rotator to mount starts on a DIFFERENT scene — the app should never look like
 * the same photo is stamped on every page. Keyed by the scene's light src, which
 * identifies the scene regardless of which variant (light/dark) is on screen.
 */
const LAST_SCENE_STORAGE_KEY = "brainstorm_hero_last_scene";

function readLastShown(): string | undefined {
  try {
    return sessionStorage.getItem(LAST_SCENE_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberShown(key: string | undefined): void {
  if (!key) return;
  try {
    sessionStorage.setItem(LAST_SCENE_STORAGE_KEY, key);
  } catch {}
}

function pickStartIndex(scenes: HeroScene[]): number {
  if (scenes.length <= 1) return 0;
  const avoid = readLastShown();
  const fresh = scenes.map((_, i) => i).filter((i) => scenes[i].light !== avoid);
  const pool = fresh.length > 0 ? fresh : scenes.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
}

export interface HeroSceneRotatorProps {
  /**
   * Which variant of each scene to show. "auto" tracks the app theme (light
   * photo in light mode, dark photo in dark mode) — for theme-adaptive surfaces
   * like the homepage. "light"/"dark" force one variant — e.g. the login brand
   * panel is always-dark, so it passes "dark".
   */
  variant?: "auto" | "light" | "dark";
  scenes?: HeroScene[];
  /** Crossfade dwell time per scene, ms. */
  intervalMs?: number;
  /** CSS object-position for the photos (e.g. "center", "50% 30%"). */
  objectPosition?: string;
  /**
   * How wide the photos are drawn (`sizes` syntax), for picking among a scene's
   * `srcSet`. The rotator fills its parent, so this is the parent's width.
   */
  sizes?: string;
  /**
   * Fetch the photography only while this media query matches. For a surface
   * that CSS hides at some widths (the login panel is `hidden lg:flex`): an
   * <img> under `display: none` still downloads, and lazy loading isn't a
   * dependable way out of it, so below the query each photo is a <picture>
   * whose fallback is an inline blank and nothing is requested at all.
   */
  media?: string;
  className?: string;
}

/** A transparent 1×1 GIF: what a media-gated photo shows when its query doesn't match. */
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * One subtle grade applied to EVERY scene so the set reads as one art-directed
 * collection rather than a stock carousel — a gentle desaturation + a touch of
 * contrast, no cinematic look (per the brand guidelines' "no cinematic grading").
 * Per-scene `filter` (rare, for a genuine exposure outlier) composes on top.
 */
const SCENE_GRADE = "saturate(0.92) contrast(1.03) brightness(1.02)";

/**
 * A theme-aware, crossfading backdrop of Human-Signal hero photography. Fills
 * its positioned parent (the caller sizes it + layers scrims on top). Preloads
 * the variants it will show so fades and theme swaps never flash; pauses on
 * backgrounded tabs; honors `prefers-reduced-motion` by holding the first scene.
 */
export function HeroSceneRotator({
  variant = "auto",
  scenes = HERO_SCENES,
  intervalMs = 13000,
  objectPosition = "center",
  sizes = "100vw",
  media,
  className,
}: HeroSceneRotatorProps) {
  const isDark = useIsDark();
  const reduced = usePrefersReducedMotion();
  const dark = variant === "auto" ? isDark : variant === "dark";
  // Start on a random scene that isn't the one another surface just showed, so
  // navigating (e.g. homepage → login) doesn't land on the same photo.
  const [index, setIndex] = useState(() => pickStartIndex(scenes));

  // Record the on-screen scene so the next rotator to mount can avoid it.
  useEffect(() => {
    rememberShown(scenes[index]?.light);
  }, [scenes, index]);

  // Preload the variants we'll actually show, so crossfades + theme swaps are
  // instant (browser serves the already-decoded image from cache). Not for a
  // single scene: the <img> below already asks for it, and a second request
  // by bare `src` would ignore the srcset and fetch the widest copy beside the
  // one the browser picked. Not under an unmatched `media` either: that is the
  // download the gate exists to avoid.
  useEffect(() => {
    if (scenes.length <= 1) return;
    if (media && typeof window !== "undefined" && !window.matchMedia?.(media).matches) return;
    const preload = (src: string) => {
      const img = new Image();
      img.src = src;
    };
    scenes.forEach((s) => {
      if (variant === "auto") {
        preload(s.light);
        preload(s.dark);
      } else {
        preload(dark ? s.dark : s.light);
      }
    });
  }, [scenes, variant, dark, media]);

  // Auto-advance, respecting reduced motion + backgrounded tabs.
  useEffect(() => {
    if (reduced || scenes.length <= 1) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      setIndex((i) => (i + 1) % scenes.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [reduced, scenes.length, intervalMs]);

  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
      data-testid="hero-scene-rotator"
    >
      {scenes.map((s, i) => {
        const src = dark ? s.dark : s.light;
        const srcSet = s.srcSet ? (dark ? s.srcSet.dark : s.srcSet.light) : undefined;
        const img = (
          <img
            key={media ? undefined : i}
            src={media ? BLANK : src}
            srcSet={media ? undefined : srcSet}
            sizes={media || !srcSet ? undefined : sizes}
            alt=""
            draggable={false}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "low"}
            decoding="async"
            style={{
              objectPosition: s.objectPosition ?? objectPosition,
              filter: s.filter ? `${SCENE_GRADE} ${s.filter}` : SCENE_GRADE,
            }}
            className={cn(
              "absolute inset-0 h-full w-full select-none object-cover transition-opacity ease-in-out",
              // Explicit property: tailwindcss-animate also claims `duration-*`.
              "[transition-duration:2000ms] motion-reduce:[transition-duration:0ms]",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        );
        if (!media) return img;
        return (
          <picture key={i}>
            <source media={media} srcSet={srcSet ?? src} sizes={srcSet ? sizes : undefined} />
            {img}
          </picture>
        );
      })}
    </div>
  );
}
