import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";

/** How far a fade at the strip's edge runs. */
const EDGE_FADE = "1.5rem";

/**
 * Whether a scrolling strip has more past either edge, kept as it scrolls, resizes and changes —
 * a phone's tab row gives no other sign it scrolls, and a tab cut off at its edge reads as broken.
 */
export function useScrollEdges(): [(el: HTMLElement | null) => void, { start: boolean; end: boolean }] {
  // The strip by a callback ref: it may mount after the page does, and the listeners follow it.
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, [el]);
  // Every render: the tabs it holds change with the words and the counts.
  useLayoutEffect(measure);
  useEffect(() => {
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    resized?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      resized?.disconnect();
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
