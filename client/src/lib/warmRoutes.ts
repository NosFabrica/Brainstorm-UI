/**
 * The common pages' code, fetched ahead of a visit (lib/lazyWithReload
 * preload): once the app is idle, one page after another so it never
 * competes with what the reader is looking at. Moving to one later shows the
 * page instead of the loading screen. Not on Data Saver or a slow connection
 * (lib/connection): the reader's data is theirs.
 */
import { connectionSpeed, type ConnectionSpeed } from "@/lib/connection";

interface Warmable {
  preload: () => Promise<void>;
}

/** After the browser's next idle moment, or a few seconds where it can't say. */
function afterIdle(run: () => void): void {
  const ric = (window as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(run, { timeout: 5000 });
  else window.setTimeout(run, 3000);
}

export function warmRoutes(
  pages: readonly Warmable[],
  {
    whenIdle = afterIdle,
    speed = connectionSpeed,
  }: { whenIdle?: (run: () => void) => void; speed?: () => ConnectionSpeed } = {},
): void {
  if (speed() !== "normal") return;
  whenIdle(() => {
    void pages.reduce<Promise<void>>((done, p) => done.then(() => p.preload()), Promise.resolve());
  });
}
