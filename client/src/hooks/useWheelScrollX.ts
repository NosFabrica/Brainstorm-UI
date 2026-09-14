import { useCallback, useRef } from "react";

/**
 * Mouse-wheel → horizontal scroll for a strip (facet chips, the People
 * strip). Trackpads and touch already scroll a horizontal overflow natively;
 * a plain mouse wheel doesn't — so a vertical wheel becomes a horizontal
 * scroll here. At either end the wheel is handed back to the page, so the
 * strip never traps the reader.
 *
 * Returns a CALLBACK ref, not an effect over a ref object: the People strip
 * only renders once results stream in, long after its component mounted, and
 * a mount-time effect would find no element and never attach.
 */
export function useWheelScrollX(): (el: HTMLElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    // passive:false — preventDefault must be honored, which React's synthetic
    // onWheel (passive) can't guarantee.
    el.addEventListener("wheel", onWheel, { passive: false });
    cleanup.current = () => el.removeEventListener("wheel", onWheel);
  }, []);
}
