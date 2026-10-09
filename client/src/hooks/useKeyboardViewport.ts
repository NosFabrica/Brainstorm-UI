import { useLayoutEffect, type RefObject } from "react";
import { isTouchScreen } from "@/lib/touchScreen";

/** Every property the pin sets, so letting go removes exactly these. */
const PINNED = ["position", "left", "right", "top", "height", "z-index", "--bs-bottom-inset"];

/**
 * Pins a one-screen page to what is visible above the on-screen keyboard.
 *
 * iOS neither shrinks `dvh` nor the layout viewport for its keyboard: it scrolls the
 * document instead, to keep the focused field in sight. A page sized to the screen with
 * its field at the foot — Messages' composer — went up with it, header and all, under
 * the status bar and off the top, leaving a blank pane over the keyboard. The visual
 * viewport is the one thing that does know: fixed to its offset and height, the page
 * stays put wherever iOS scrolls the document.
 *
 * Written straight onto `target`, not through React: the visual viewport reports every
 * frame of the keyboard's slide and of any pan while it is up, and a state update per
 * event re-rendered the whole Messages page each time — a frame behind the compositor.
 * A layout effect, so the pin is on before the first editing frame paints and off
 * before the first one after.
 *
 * Also sets `--bs-bottom-inset`: 0 while the keyboard covers the home indicator, so a
 * bar at the page's foot drops the safe-area padding it keeps for it — else an empty
 * band sat between the composer and the keyboard.
 *
 * Only while `active` (a field has focus) and only on a touch screen.
 */
export function useKeyboardViewport(active: boolean, target: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const el = target.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !el || !vv || !isTouchScreen()) return;

    let last = "";
    const pin = () => {
      // Shorter than the layout viewport: the keyboard (or its accessory bar) covers the
      // bottom edge. Not `innerHeight`: iOS shrinks that with the keyboard too, so the two
      // matched, the home-indicator padding stayed, and a band sat under the composer.
      const covered = vv.height < document.documentElement.clientHeight - 1;
      const next = `${vv.offsetTop}|${vv.height}|${covered}`;
      if (next === last) return;
      last = next;
      el.style.position = "fixed";
      el.style.left = "0px";
      el.style.right = "0px";
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.zIndex = "30";
      if (covered) el.style.setProperty("--bs-bottom-inset", "0px");
      else el.style.removeProperty("--bs-bottom-inset");
    };
    pin();
    vv.addEventListener("resize", pin);
    vv.addEventListener("scroll", pin);
    return () => {
      vv.removeEventListener("resize", pin);
      vv.removeEventListener("scroll", pin);
      for (const property of PINNED) el.style.removeProperty(property);
    };
  }, [active, target]);
}
