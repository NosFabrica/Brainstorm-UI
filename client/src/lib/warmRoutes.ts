/**
 * The common pages' code, fetched ahead of a visit (lib/lazyWithReload
 * preload): once the app is idle, one page after another so it never
 * competes with what the reader is looking at. Moving to one later shows the
 * page instead of the loading screen. Not on Data Saver or a slow connection
 * (lib/connection): the reader's data is theirs.
 */
import type { Observable } from "rxjs";
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

/** What a reader starts using the app with: a tap, a key, a scroll. */
const INTERACTIONS = ["pointerdown", "keydown", "scroll"] as const;

/**
 * The app's warm-up, by who is visiting. `always` for everyone; `signedIn`
 * once an account is active (the dashboard is theirs alone); `onInteraction`
 * once an anonymous reader starts using the page, rather than for every
 * one-off visitor who reads the landing and leaves. Each set at most once, and
 * none on a slow connection (warmRoutes). Returns a stop.
 */
export function warmAppRoutes(
  pages: { always: readonly Warmable[]; signedIn: readonly Warmable[]; onInteraction: readonly Warmable[] },
  {
    active$,
    target = window,
    whenIdle = afterIdle,
    speed = connectionSpeed,
  }: {
    active$: Observable<unknown>;
    target?: EventTarget;
    whenIdle?: (run: () => void) => void;
    speed?: () => ConnectionSpeed;
  },
): () => void {
  const warm = (set: readonly Warmable[]) => warmRoutes(set, { whenIdle, speed });
  warm(pages.always);

  let signedIn = false;
  const sub = active$.subscribe((account) => {
    if (!account || signedIn) return;
    signedIn = true;
    warm(pages.signedIn);
  });

  const onInteraction = () => {
    stopListening();
    warm(pages.onInteraction);
  };
  const stopListening = () => {
    for (const type of INTERACTIONS) target.removeEventListener(type, onInteraction);
  };
  for (const type of INTERACTIONS) target.addEventListener(type, onInteraction, { passive: true, once: true });

  return () => {
    sub.unsubscribe();
    stopListening();
  };
}
