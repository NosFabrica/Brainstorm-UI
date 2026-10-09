/**
 * The service worker: what makes the installed app open with no signal, and what
 * lets a phone show a message notification at all (Android refuses `new
 * Notification()`; only a worker's `showNotification` reaches its tray).
 *
 * Built by the `service-worker` plugin in vite.config.ts — transpiled on its own,
 * with the build's file list and id stamped in — and served as /sw.js. It
 * imports nothing: a worker is one classic script.
 *
 * What it does with a request (`strategyFor`):
 *   - a page load: the network, with this device's last copy of the app shell
 *     when the network fails or hangs (the app renders, and reads its data as it
 *     always does — from IndexedDB, the relays, the API). Only this build's
 *     HTML is kept, so the copy always matches the assets kept beside it;
 *   - a hashed asset: the cache, else the network (the name changes with the content);
 *   - config.js and the manifest: the network, else the last copy — on the same
 *     clock as a page load, since the page waits on config.js before it runs;
 *   - icons and brand art: the last copy at once, refreshed behind it;
 *   - anything else — the API, relays, link previews, thumbnails, share cards,
 *     video — passes through untouched.
 *
 * It never activates itself over a running page: an update waits for the page to
 * ask (lib/serviceWorker), so a page is never served assets from a build it
 * didn't load.
 */

/** The build this worker belongs to; the page carries the same id (lib/serviceWorker). */
declare const __SW_BUILD_ID__: string;
/** The app shell's assets: the entry and everything it imports, CSS and fonts included. */
declare const __SW_PRECACHE__: string[];
/** This build's entry script: a page whose HTML names it belongs to this build. */
declare const __SW_ENTRY__: string;
/** The main screens' chunks, cached only when the page asks — an installed app does. */
declare const __SW_ROUTES__: string[];

export type Strategy = "shell" | "cache-first" | "network-first" | "stale-while-revalidate";

/** Paths nginx answers itself (crawler cards, proxies, files with no SPA behind them). */
const PASSTHROUGH = ["/og/", "/img/", "/link-preview", "/.well-known/", "/bot", "/robots.txt"];

/** Hashed asset types worth keeping; video is left to the network (range requests). */
const CACHEABLE_ASSET = /\.(?:js|css|woff2?|webp|png|jpe?g|gif|svg|avif)$/i;

/**
 * How long a page load or config.js waits on the network before this device's
 * copy answers instead: long enough for a slow-but-working link to win, short
 * enough that a dead one doesn't feel dead.
 */
export const SLOW_NETWORK_MS = 4000;

export function strategyFor(url: URL, request: { method: string; mode: string }, origin: string): Strategy | null {
  if (request.method !== "GET" || url.origin !== origin) return null;
  const path = url.pathname;
  if (PASSTHROUGH.some((prefix) => path === prefix || path.startsWith(prefix))) return null;
  if (request.mode === "navigate") return "shell";
  if (path.startsWith("/assets/")) return CACHEABLE_ASSET.test(path) ? "cache-first" : null;
  if (path === "/config.js" || path === "/site.webmanifest") return "network-first";
  if (
    path.startsWith("/icons/") ||
    path.startsWith("/brand/") ||
    path.startsWith("/favicon") ||
    path === "/apple-touch-icon.png"
  )
    return "stale-while-revalidate";
  return null;
}

/** The cache key every page load shares: the SPA is one document whatever the path. */
export const SHELL_KEY = "/";

/**
 * Kept at install, beside the shell: what a page loads outside the hashed bundle.
 * The wordmark included — art under /brand/ is otherwise kept only when a page this
 * worker controls asks for it, and the first page an installed app opens isn't one
 * (on iOS its storage starts empty, so the worker installs during that load): its
 * first launch offline showed a broken image where the wordmark goes.
 */
export const INSTALL_EXTRAS = [
  "/config.js",
  "/site.webmanifest",
  "/icons/icon-192.png",
  "/icons/badge-96.png",
  "/brand/wordmark.svg",
  "/brand/wordmark-white.svg",
  "/brand/wordmark-black.svg",
];

// --- The worker -------------------------------------------------------------
// Typed by hand: the project's tsconfig carries the DOM library, and the
// WebWorker one can't sit beside it.

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  preloadResponse: Promise<Response | undefined>;
  respondWith(response: Promise<Response>): void;
}
interface MessageEventLike extends ExtendableEvent {
  data: unknown;
  ports: readonly MessagePort[];
}
interface WindowClientLike {
  url: string;
  focus(): Promise<unknown>;
  postMessage(message: unknown): void;
}
interface NotificationEventLike extends ExtendableEvent {
  notification: Notification;
}
interface WorkerScope {
  location: Location;
  registration: ServiceWorkerRegistration & { navigationPreload?: { enable(): Promise<void> } };
  clients: {
    claim(): Promise<void>;
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: string, listener: (event: never) => void): void;
}

function startWorker(scope: WorkerScope): void {
  const CACHE = `brainstorm-${__SW_BUILD_ID__}`;
  const asPath = (file: string) => `/${file}`;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /** Keep a response if it is whole and ours: an opaque, partial or failed one is not. */
  const keepable = (response: Response) => response.ok && response.status === 200 && response.type === "basic";

  const isHtml = (response: Response) => (response.headers.get("content-type") ?? "").includes("text/html");

  /**
   * A hashed asset worth keeping. Not HTML: a server whose SPA fallback answers a
   * deleted chunk with the page (200, text/html) would otherwise pin that page as
   * the chunk, and the screen would fail to load for as long as the cache lasts.
   */
  const keepableAsset = (response: Response) => keepable(response) && !isHtml(response);

  async function remember(request: Request | string, response: Response): Promise<void> {
    if (!keepable(response)) return;
    const cache = await caches.open(CACHE);
    await cache.put(request, response);
  }

  /** HTML from this build: it loads this build's entry script. */
  const ofThisBuild = async (response: Response) => (await response.clone().text()).includes(__SW_ENTRY__);

  /**
   * Put a hashed file in this build's cache. A deploy changes few of them, and
   * the previous build's cache already holds the rest: copied from there, not
   * downloaded again. Resolves whether it is now held.
   */
  async function keepHashed(cache: Cache, url: string): Promise<boolean> {
    if (await cache.match(url, { ignoreVary: true })) return true;
    const held = await caches.match(url, { ignoreVary: true });
    if (held) {
      await cache.put(url, held);
      return true;
    }
    const response = await fetch(url);
    if (!keepableAsset(response)) return false;
    await cache.put(url, response);
    return true;
  }

  /** Each URL not already held; one that fails is skipped, not fatal. */
  async function fill(urls: string[], fetchFresh = false): Promise<void> {
    const cache = await caches.open(CACHE);
    await Promise.all(
      urls.map(async (url) => {
        try {
          if (!fetchFresh) {
            await keepHashed(cache, url);
            return;
          }
          if (await cache.match(url, { ignoreVary: true })) return;
          const response = await fetch(url, { cache: "no-cache" });
          if (keepable(response)) await cache.put(url, response);
        } catch {
          /* offline mid-install: the next visit fills it */
        }
      }),
    );
  }

  scope.addEventListener("install", (event: ExtendableEvent) => {
    // The shell must be whole or the worker isn't worth installing: a failed
    // install leaves the old worker on, and the browser tries again later.
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        // During a rolling deploy "/" can come from a pod still on the old build:
        // HTML that doesn't load this build's entry would pair old HTML with new assets.
        const page = await fetch(SHELL_KEY, { cache: "no-cache" });
        if (!keepable(page) || !(await ofThisBuild(page))) throw new Error("the page is not this build's yet");
        await cache.put(SHELL_KEY, page);
        const kept = await Promise.all(__SW_PRECACHE__.map((file) => keepHashed(cache, asPath(file))));
        if (kept.includes(false)) throw new Error("the shell could not be fetched whole");
        await fill(INSTALL_EXTRAS, true);
      })(),
    );
  });

  scope.addEventListener("activate", (event: ExtendableEvent) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter((name) => name.startsWith("brainstorm-") && name !== CACHE).map((name) => caches.delete(name)),
        );
        // The page load starts its fetch while the worker boots, instead of after.
        await scope.registration.navigationPreload?.enable().catch(() => {});
        await scope.clients.claim();
      })(),
    );
  });

  /**
   * Keep a page load's HTML as the shell — this build's only: another build's
   * (a deploy this worker predates) would be served offline beside assets this
   * cache doesn't hold. Its own worker keeps it.
   */
  async function keepShell(cache: Cache, response: Response): Promise<void> {
    if (isHtml(response) && keepable(response) && (await ofThisBuild(response))) await cache.put(SHELL_KEY, response);
  }

  async function shell(event: FetchEvent): Promise<Response> {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(SHELL_KEY, { ignoreVary: true });
    const network = (async () => {
      const response = (await event.preloadResponse) ?? (await fetch(event.request));
      // Kept beside the answer, not before it: the page streams in meanwhile.
      event.waitUntil(keepShell(cache, response.clone()));
      return response;
    })();
    // The fresh copy lands in the cache even when the cached one was served.
    event.waitUntil(network.catch(() => undefined));
    if (!cached) return network;
    return Promise.race([
      network.then((response) => (response.ok ? response : cached)).catch(() => cached),
      sleep(SLOW_NETWORK_MS).then(() => cached),
    ]);
  }

  /**
   * The cached copy of a request. `ignoreVary`: a module script's request carries
   * an Origin header the install's fetch didn't, so a `Vary: Origin` answer would
   * never match — and a hashed URL already names exactly one file.
   */
  const held = (request: Request) => caches.match(request, { ignoreVary: true });

  async function cacheFirst(event: FetchEvent): Promise<Response> {
    const cached = await held(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (keepableAsset(response)) event.waitUntil(remember(event.request, response.clone()));
    return response;
  }

  async function networkFirst(event: FetchEvent): Promise<Response> {
    const network = fetch(event.request).then((response) => {
      event.waitUntil(remember(event.request, response.clone()));
      return response;
    });
    event.waitUntil(network.catch(() => undefined));
    const cached = await held(event.request);
    if (!cached) return network;
    return Promise.race([
      network.then((response) => (response.ok ? response : cached)).catch(() => cached),
      sleep(SLOW_NETWORK_MS).then(() => cached),
    ]);
  }

  async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
    const cached = await held(event.request);
    const network = fetch(event.request).then(async (response) => {
      await remember(event.request, response.clone());
      return response;
    });
    event.waitUntil(network.catch(() => undefined));
    return cached ?? network;
  }

  const handlers: Record<Strategy, (event: FetchEvent) => Promise<Response>> = {
    shell,
    "cache-first": cacheFirst,
    "network-first": networkFirst,
    "stale-while-revalidate": staleWhileRevalidate,
  };

  scope.addEventListener("fetch", (event: FetchEvent) => {
    const strategy = strategyFor(new URL(event.request.url), event.request, scope.location.origin);
    if (strategy) event.respondWith(handlers[strategy](event));
  });

  scope.addEventListener("message", (event: MessageEventLike) => {
    const message = event.data as { type?: string } | null;
    switch (message?.type) {
      case "SKIP_WAITING":
        void scope.skipWaiting();
        break;
      case "BUILD_ID":
        event.ports[0]?.postMessage(__SW_BUILD_ID__);
        break;
      case "WARM_ROUTES":
        event.waitUntil(fill(__SW_ROUTES__.map(asPath)));
        break;
    }
  });

  // A notification tapped: back to the app (the one already open, if any) on
  // what it was about. lib/serviceWorker turns the message into a navigation.
  scope.addEventListener("notificationclick", (event: NotificationEventLike) => {
    event.notification.close();
    const data = event.notification.data as { url?: unknown } | null;
    const url = typeof data?.url === "string" && data.url.startsWith("/") ? data.url : "/";
    event.waitUntil(
      (async () => {
        const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
        const open = windows.find((client) => new URL(client.url).origin === scope.location.origin);
        if (open) {
          await open.focus();
          open.postMessage({ type: "OPEN_URL", url });
        } else {
          await scope.clients.openWindow(url);
        }
      })(),
    );
  });
}

// Only inside a worker: a test imports `strategyFor` from this file under jsdom.
declare const ServiceWorkerGlobalScope: { new (): unknown } | undefined;
if (typeof ServiceWorkerGlobalScope !== "undefined" && self instanceof ServiceWorkerGlobalScope)
  startWorker(self as unknown as WorkerScope);
