/**
 * The app coming back: shown again after being hidden, restored from the
 * back/forward cache, or back online. An installed phone app spends most of its
 * life suspended — iOS freezes it the moment another app is in front — and
 * there is no pull-to-refresh and no reload button to fall back on, so what was
 * left running has to pick itself up (services/appResume says what does).
 *
 * `away` is how long it was gone: hidden or offline since, or 0 when unknown.
 */
export type ResumeListener = (awayMs: number) => void;

/** Two signals for one return (a page shown as it comes back online) count once. */
const DEDUPE_MS = 1000;

export function onAppResume(listener: ResumeListener, now: () => number = Date.now): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let leftAt = document.visibilityState === "hidden" ? now() : null;
  let lastFired = -Infinity;

  const fire = () => {
    const at = now();
    const away = leftAt === null ? 0 : at - leftAt;
    leftAt = null;
    if (at - lastFired < DEDUPE_MS) return;
    lastFired = at;
    listener(away);
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") leftAt ??= now();
    else fire();
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) fire();
  };
  const onOffline = () => {
    leftAt ??= now();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", fire);
  window.addEventListener("offline", onOffline);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", fire);
    window.removeEventListener("offline", onOffline);
  };
}
