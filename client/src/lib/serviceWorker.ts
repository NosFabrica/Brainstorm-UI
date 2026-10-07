/**
 * The page's side of the service worker (client/src/sw/sw.ts): registering it,
 * taking its updates, and showing notifications through it.
 *
 * Updates. A deploy ships a new worker, which installs beside the running one
 * and waits. Page loads go to the network first, so the page usually already
 * runs the new build by the time its worker is found — then the worker is
 * swapped in quietly. Only a page older than the waiting worker (it was opened
 * before the deploy, or launched offline from the cached shell) is told a new
 * version is ready (`useAppUpdate`), and reloads when the reader says so.
 *
 * Notifications. Android has no `new Notification()` — only a worker's
 * `showNotification` reaches its tray — and a tapped one comes back here as a
 * message naming where to go (`onOpenUrl`).
 */
import { useSyncExternalStore } from "react";
import { isInstalledApp } from "./installedApp";

/** The build this page runs; its worker carries the same id. */
export const BUILD_ID = typeof __BUILD_ID__ === "undefined" ? "dev" : __BUILD_ID__;

/** How often a long-open page looks for a deploy, besides on every return to it. */
const UPDATE_CHECK_MS = 60 * 60_000;

let registration: ServiceWorkerRegistration | null = null;
let started = false;
let updateReady = false;
let reloading = false;
const updateListeners = new Set<() => void>();
const openUrlListeners = new Set<(url: string) => void>();
/** A notification tapped before anything was listening (the app still booting). */
let pendingUrl: string | null = null;

const supported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

function setUpdateReady(ready: boolean) {
  if (updateReady === ready) return;
  updateReady = ready;
  for (const listener of updateListeners) listener();
}

/** A worker's build id, or null if it doesn't say (an older worker, or a dead one). */
function buildIdOf(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 3000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data === "string" ? event.data : null);
    };
    worker.postMessage({ type: "BUILD_ID" }, [channel.port2]);
  });
}

/** A worker finished installing behind the one running this page. */
async function consider(worker: ServiceWorker, reg: ServiceWorkerRegistration) {
  // Nothing active: the first install, which takes the page over by itself. (Not
  // "no controller": a hard reload leaves the page uncontrolled with an update waiting.)
  if (!reg.active) return;
  if ((await buildIdOf(worker)) === BUILD_ID) {
    // The page already runs this build: nothing on screen changes.
    worker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  setUpdateReady(true);
}

/** Register /sw.js once the page has loaded (production builds only). */
export function registerServiceWorker(): void {
  if (started || !import.meta.env.PROD || !supported()) return;
  started = true;
  const container = navigator.serviceWorker;

  container.addEventListener("controllerchange", () => {
    if (reloading) {
      window.location.reload();
      return;
    }
    // Never reloaded under the reader. But another tab's quiet swap can put a newer
    // build in charge of this older page, whose next screen's chunk is no longer
    // kept: say a new version is ready, as for an update found here.
    const controller = container.controller;
    if (controller)
      void buildIdOf(controller).then((id) => {
        if (id !== BUILD_ID) setUpdateReady(true);
      });
  });
  container.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string; url?: unknown } | null;
    if (data?.type === "OPEN_URL" && typeof data.url === "string") openUrl(data.url);
  });

  const start = () => {
    container
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        const watch = (worker: ServiceWorker | null) =>
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") void consider(worker, reg);
          });
        if (reg.waiting) void consider(reg.waiting, reg);
        // Already installing: the browser's own check on this load beat our register().
        watch(reg.installing);
        reg.addEventListener("updatefound", () => watch(reg.installing));
        // An installed app keeps its main screens too, so it opens any of them offline.
        if (isInstalledApp()) void container.ready.then((ready) => ready.active?.postMessage({ type: "WARM_ROUTES" }));
      })
      .catch(() => {
        /* no worker (private mode, a blocked origin): the app works as a plain page */
      });
  };
  // After the page's own requests: registering fetches the shell's files.
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  setInterval(checkForUpdate, UPDATE_CHECK_MS);
}

/** Ask for a newer worker now — on a return to the app, and on a timer. */
export function checkForUpdate(): void {
  void registration?.update().catch(() => {});
}

/** Reload into the waiting build. */
export function applyUpdate(): void {
  reloading = true;
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

/** Whether a newer build is waiting for this page to reload. */
export function useAppUpdate(): boolean {
  return useSyncExternalStore(
    (listener) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    () => updateReady,
    () => false,
  );
}

function openUrl(url: string) {
  if (openUrlListeners.size === 0) {
    pendingUrl = url;
    return;
  }
  for (const listener of openUrlListeners) listener(url);
}

/** Called with the in-app path a tapped notification is about. */
export function onOpenUrl(listener: (url: string) => void): () => void {
  openUrlListeners.add(listener);
  if (pendingUrl !== null) {
    const url = pendingUrl;
    pendingUrl = null;
    listener(url);
  }
  return () => openUrlListeners.delete(listener);
}

/**
 * Show a notification through the worker. Resolves false where there is none
 * (development, or a browser without one) — the caller falls back to `new
 * Notification()`, which desktop browsers still take.
 */
export async function showAppNotification(
  title: string,
  { url, ...options }: NotificationOptions & { url: string },
): Promise<boolean> {
  if (!supported()) return false;
  const reg = registration ?? (await navigator.serviceWorker.getRegistration().catch(() => undefined));
  if (!reg?.active) return false;
  await reg.showNotification(title, {
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    ...options,
    data: { url },
  });
  return true;
}

/** Test seam. */
export function __resetServiceWorker(): void {
  registration = null;
  started = false;
  updateReady = false;
  reloading = false;
  pendingUrl = null;
  updateListeners.clear();
  openUrlListeners.clear();
}
