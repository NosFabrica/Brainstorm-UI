/**
 * The app coming back: shown again after being hidden, restored from the
 * back/forward cache, or back online. An installed phone app spends most of its
 * life suspended — iOS freezes it the moment another app is in front — and
 * there is no pull-to-refresh and no reload button to fall back on, so what was
 * left running has to pick itself up (services/appResume says what does).
 *
 * `away` is how long it was gone: hidden or offline since, or 0 when unknown.
 * `how`: shown again ("visible", which includes every tab switch), restored from
 * the back/forward cache ("pageshow"), or the connection back ("online").
 * Nothing fires while the page is hidden: a connection that comes back in the
 * background is counted when the reader returns, with the whole time away.
 */
export type ResumeHow = "visible" | "pageshow" | "online";
export type ResumeListener = (awayMs: number, how: ResumeHow) => void;

/** Two signals for one return (a page shown as it comes back online) count once. */
const DEDUPE_MS = 1000;

export function onAppResume(listener: ResumeListener, now: () => number = Date.now): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  let leftAt = document.visibilityState === "hidden" ? now() : null;
  let lastFired = -Infinity;

  const fire = (how: ResumeHow) => {
    if (document.visibilityState === "hidden") return;
    const at = now();
    const away = leftAt === null ? 0 : at - leftAt;
    leftAt = null;
    if (at - lastFired < DEDUPE_MS) return;
    lastFired = at;
    listener(away, how);
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") leftAt ??= now();
    else fire("visible");
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) fire("pageshow");
  };
  const onOnline = () => fire("online");
  const onOffline = () => {
    leftAt ??= now();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
