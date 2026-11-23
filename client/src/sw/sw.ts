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
 *   - icons and brand art: the last copy at once, refreshed behind it, and
 *     carried over to the next build's cache rather than fetched again;
 *   - thumbnails (/img/), on a device that runs the installed app: the cache,
 *     else the network, in a store of their own capped at THUMBNAIL_LIMIT;
 *   - anything else — the API, relays, link previews, share cards, video —
 *     passes through untouched.
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

export type Strategy = "shell" | "cache-first" | "network-first" | "stale-while-revalidate" | "thumbnail";

/** Paths nginx answers itself (crawler cards, proxies, files with no SPA behind them). */
const PASSTHROUGH = [
  "/og/",
  "/link-preview",
  "/.well-known/",
  "/bot",
  "/robots.txt",
  "/built-on/",
  "/github/",
  "/openlibrary/",
];

/** Hashed asset types worth keeping; video is left to the network (range requests). */
const CACHEABLE_ASSET = /\.(?:js|css|woff2?|webp|png|jpe?g|gif|svg|avif)$/i;

/**
 * A hashed image bigger than this is served but not kept: the cache is for
 * opening the app offline, and one oversized photo shouldn't cost a phone's
 * storage what a hundred screens' chunks do.
 */
export const LARGEST_KEPT_IMAGE = 1_500_000;
const IMAGE = /\.(?:webp|png|jpe?g|gif|avif)$/i;

/**
 * Unhashed art a page shows (/brand/, /icons/): kept in this build's cache like
 * the rest, and copied into the next build's when it activates, so a deploy
 * doesn't send every icon and photo down again. A file that did change is
 * refreshed behind the copy by stale-while-revalidate the first time it's shown.
 */
const CARRIED_OVER = ["/brand/", "/icons/"];

/**
 * Thumbnails kept, at most: about a screenful of results pages. Oldest first out.
 * Kept a week at most too: a thumbnail's URL names its source image, and a source
 * that changes in place (an avatar at a fixed URL) shouldn't show its old self
 * for good.
 */
export const THUMBNAIL_LIMIT = 500;
export const THUMBNAIL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  // A thumbnail an <img> asks for. Opened as a page, it is nginx's to answer.
  if (path.startsWith("/img/")) return request.mode === "navigate" ? null : "thumbnail";
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
  /** Not per build: a thumbnail doesn't change with the app. */
  const THUMBNAILS = "brainstorm-thumbnails";
  /**
   * Kept in THUMBNAILS (no /img/ URL is ever this) once a page has said it is the
   * installed app. The worker can't tell a browser tab from the installed app;
   * the page can, and says so with WARM_ROUTES (lib/serviceWorker). Remembered,
   * because a worker is stopped when idle and starts again knowing nothing.
   */
  const INSTALLED_MARK = "/img/.installed-app";
  let keepThumbnails = false;
  void caches
    .open(THUMBNAILS)
    .then((cache) => cache.match(INSTALLED_MARK))
    .then((mark) => {
      if (mark) keepThumbnails = true;
    })
    .catch(() => {});
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

  /**
   * Copy the previous builds' /brand/ and /icons/ files into this build's cache,
   * those it hasn't already fetched (the install's own fresh copies win). Best
   * effort: a copy that fails is fetched again when a page next shows it.
   */
  async function carryOver(previous: string[]): Promise<void> {
    try {
      const cache = await caches.open(CACHE);
      for (const name of previous) {
        const old = await caches.open(name);
        for (const request of await old.keys()) {
          if (!CARRIED_OVER.some((prefix) => new URL(request.url).pathname.startsWith(prefix))) continue;
          if (await cache.match(request, { ignoreVary: true })) continue;
          const response = await old.match(request, { ignoreVary: true });
          if (response) await cache.put(request, response);
        }
      }
    } catch {
      /* storage full or gone: the art comes from the network instead */
    }
  }

  scope.addEventListener("activate", (event: ExtendableEvent) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        const previous = names.filter(
          (name) => name.startsWith("brainstorm-") && name !== CACHE && name !== THUMBNAILS,
        );
        await carryOver(previous);
        await Promise.all(previous.map((name) => caches.delete(name)));
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

  /** A hashed image too big to be worth a place in the cache (LARGEST_KEPT_IMAGE). */
  const oversized = (request: Request, response: Response) =>
    IMAGE.test(new URL(request.url).pathname) &&
    Number(response.headers.get("content-length") ?? 0) > LARGEST_KEPT_IMAGE;

  async function cacheFirst(event: FetchEvent): Promise<Response> {
    const cached = await held(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (keepableAsset(response) && !oversized(event.request, response))
      event.waitUntil(remember(event.request, response.clone()));
    return response;
  }

  /** Thumbnails put in this worker's life; the store is trimmed on the first and every 20th. */
  let thumbnailsPut = 0;

  /** Down to THUMBNAIL_LIMIT, oldest first: a cache lists its keys in the order they were put. */
  async function trimThumbnails(cache: Cache): Promise<void> {
    const keys = (await cache.keys()).filter((request) => new URL(request.url).pathname !== INSTALLED_MARK);
    await Promise.all(
      keys.slice(0, Math.max(0, keys.length - THUMBNAIL_LIMIT)).map((request) => cache.delete(request)),
    );
  }

  /** Kept less than THUMBNAIL_MAX_AGE_MS ago, by the date the server stamped on it. */
  const recent = (response: Response) => {
    const date = Date.parse(response.headers.get("date") ?? "");
    return Number.isFinite(date) && Date.now() - date < THUMBNAIL_MAX_AGE_MS;
  };

  /**
   * A thumbnail: the kept copy while it's recent, else the network, kept for next
   * time. Only a whole same-origin image is kept: when imgproxy is down nginx
   * redirects to the original elsewhere (opaque here), and that is left alone.
   * An old copy still beats a broken image when the network fails.
   */
  async function thumbnail(event: FetchEvent): Promise<Response> {
    const cache = await caches.open(THUMBNAILS);
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached && recent(cached)) return cached;
    try {
      const response = await fetch(event.request);
      if (keepableAsset(response)) {
        const count = ++thumbnailsPut;
        event.waitUntil(
          cache
            .put(event.request, response.clone())
            .then(() => (count === 1 || count % 20 === 0 ? trimThumbnails(cache) : undefined))
            .catch(() => {}),
        );
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
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
    thumbnail,
  };

  scope.addEventListener("fetch", (event: FetchEvent) => {
    const strategy = strategyFor(new URL(event.request.url), event.request, scope.location.origin);
    // Thumbnails only for the installed app; a browser tab has the HTTP cache.
    if (strategy === "thumbnail" && !keepThumbnails) return;
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
        // Only the installed app asks this (lib/serviceWorker): this device runs it.
        if (!keepThumbnails) {
          keepThumbnails = true;
          event.waitUntil(
            caches
              .open(THUMBNAILS)
              .then((cache) => cache.put(INSTALLED_MARK, new Response("")))
              .catch(() => {}),
          );
        }
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
