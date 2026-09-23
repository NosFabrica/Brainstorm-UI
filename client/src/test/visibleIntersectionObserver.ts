import { vi } from "vitest";

/**
 * `setup.ts` gives jsdom a no-op IntersectionObserver on purpose — FeedVideo's
 * autoplay-in-view must stay inert in tests. Anything gated on visibility
 * therefore never opens, so a component that waits to be seen before it asks
 * for data would appear permanently empty.
 *
 * Call this in suites covering such a component: it reports the element as
 * visible the moment it is observed, which is what a browser does for
 * something already on screen.
 */
class VisibleIntersectionObserver {
  root = null;
  rootMargin = "";
  thresholds: number[] = [];
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb(
      [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

export function stubVisibleIntersectionObserver(): void {
  vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);
}
