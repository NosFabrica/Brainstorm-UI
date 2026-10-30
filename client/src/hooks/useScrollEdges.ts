import { useCallback, useEffect, useState, type CSSProperties } from "react";

/** How far a fade at the strip's edge runs. */
const EDGE_FADE = "1.5rem";
/**
 * How much more past an edge counts. Sub-pixel layout can put a strip that fits a pixel over
 * (a phone's fractional widths), and the fade itself can shift that pixel back: a fade that flips
 * on it would flicker.
 */
const SLACK_PX = 2;

/**
 * Whether a scrolling strip has more past either edge, kept as it scrolls, resizes and its tabs
 * change — a phone's tab row gives no other sign it scrolls, and a tab cut off at its edge reads
 * as broken. Measured a frame after each change, never while rendering: a render that measured
 * and set what it measured would loop whenever the answer shifts what it measures.
 */
export function useScrollEdges(): [(el: HTMLElement | null) => void, { start: boolean; end: boolean }] {
  // The strip by a callback ref: it may mount after the page does, and the listeners follow it.
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    if (!el) return;
    const start = el.scrollLeft > SLACK_PX;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - SLACK_PX;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, [el]);
  useEffect(() => {
    if (!el) return;
    const raf = typeof requestAnimationFrame === "function";
    let frame: number | null = null;
    const soon = () => {
      if (frame !== null) return;
      const next = () => {
        frame = null;
        measure();
      };
      frame = raf ? requestAnimationFrame(next) : window.setTimeout(next, 16);
    };
    measure();
    el.addEventListener("scroll", soon, { passive: true });
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(soon) : null;
    resized?.observe(el);
    // Its tabs change with the words and the counts: a tab more or less, a name longer.
    const changed = typeof MutationObserver === "function" ? new MutationObserver(soon) : null;
    changed?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      if (frame !== null) (raf ? cancelAnimationFrame : window.clearTimeout)(frame);
      el.removeEventListener("scroll", soon);
      resized?.disconnect();
      changed?.disconnect();
    };
  }, [el, measure]);
  return [setEl, edges];
}

/** The strip fades out at an edge it has more past. */
export function edgeFade({ start, end }: { start: boolean; end: boolean }): CSSProperties | undefined {
  if (!start && !end) return undefined;
  const mask = `linear-gradient(to right, ${start ? "transparent" : "black"} 0, black ${start ? EDGE_FADE : "0"}, black calc(100% - ${end ? EDGE_FADE : "0px"}), ${end ? "transparent" : "black"} 100%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
