import { useEffect, useState, type CSSProperties } from "react";
import { isTouchScreen } from "@/lib/touchScreen";

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
 * Only while `active` (a field has focus) and only on a touch screen; otherwise
 * `undefined`, and the page keeps its own sizing.
 *
 * Also sets `--bs-bottom-inset`: 0 while the keyboard covers the home indicator, so a
 * bar at the page's foot drops the safe-area padding it keeps for it — else an empty
 * band sat between the composer and the keyboard.
 */
export function useKeyboardViewport(active: boolean): CSSProperties | undefined {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv || !isTouchScreen()) {
      setBox(null);
      return;
    }
    const sync = () => setBox({ top: vv.offsetTop, height: vv.height });
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [active]);

  if (!box) return undefined;
  // Shorter than the window: something (the keyboard, its accessory bar) covers the bottom edge.
  const covered = box.height < window.innerHeight - 1;
  return {
    position: "fixed",
    left: 0,
    right: 0,
    top: box.top,
    height: box.height,
    zIndex: 30,
    ...(covered && { "--bs-bottom-inset": "0px" }),
  } as CSSProperties;
}
