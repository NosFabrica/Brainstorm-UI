import { useEffect, useState, type RefObject } from "react";

/**
 * Every autoplay-in-view `<video>` registers here so only ONE plays at a time —
 * when one starts, the rest pause. This is the X/Twitter timeline behavior:
 * scrolling a new video into view takes over playback from the previous one.
 */
const registry = new Set<HTMLVideoElement>();

function playSolo(el: HTMLVideoElement) {
  for (const other of registry) {
    if (other !== el && !other.paused) other.pause();
  }
}

/** True when the user has asked the OS to reduce motion (autoplay is suppressed). */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

/**
 * Autoplay a muted `<video>` once it is ≥60% in view, and pause it when it
 * leaves — coordinated so only one registered video plays at a time. No-op when
 * `enabled` is false (e.g. reduced motion, where we fall back to click-to-play).
 */
export function useAutoplayInView(ref: RefObject<HTMLVideoElement>, enabled: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    registry.add(el);
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          playSolo(el);
          el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      registry.delete(el);
    };
  }, [ref, enabled]);
}
