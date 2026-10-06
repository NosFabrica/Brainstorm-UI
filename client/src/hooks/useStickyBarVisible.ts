import { useEffect, useState, type RefObject } from "react";

/** How far the page must move one way before the bar changes its mind — a jitter isn't a direction. */
const SLACK = 8;
/** Near the top the bar always shows: nothing has been read yet to make room for. */
const TOP = 80;

/**
 * Whether a sticky bottom call to action should show: not while the reader is scrolling
 * down to read, and not while the same call to action is on screen in the page.
 *
 * On a phone it sits on top of the tab bar, and the two took a quarter of the screen
 * the whole way down a profile — with a second, identical "Join free" button in view
 * for part of it. It comes back the moment the reader scrolls up, as Safari's own
 * toolbar does.
 */
export function useStickyBarVisible(inline: RefObject<Element | null>): boolean {
  const [readingDown, setReadingDown] = useState(false);
  const [inlineShown, setInlineShown] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < TOP) setReadingDown(false);
      else if (y - last > SLACK) setReadingDown(true);
      else if (last - y > SLACK) setReadingDown(false);
      else return;
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const el = inline.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setInlineShown(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [inline]);

  return !readingDown && !inlineShown;
}
