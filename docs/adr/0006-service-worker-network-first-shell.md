# A service worker with a network-first shell, updated on the reader's say

The installed app (PWA) opened to the browser's offline page with no signal,
couldn't show a message notification on Android (only a service worker's
`showNotification` reaches the tray), and had nothing to keep a cold launch from
waiting on the network for every byte. A service worker fixes all three; the
choice is what it may serve from its cache, because a cache that answers first
pins people to an old build.

## The rule

- **Page loads go to the network first.** The cached shell answers only when the
  network fails, errors, or takes longer than 4s (`SLOW_NETWORK_MS`); config.js,
  which the page waits on before it runs, is on the same clock. A deploy reaches
  everyone on their next launch, as it did before the worker. The cache keeps
  only its own build's HTML, so the offline shell always matches the assets
  beside it.
- **A deploy downloads only what changed.** Installing copies the hashed files
  the previous build's cache already holds.
- **Hashed assets come from the cache.** Their names change with their content,
  so a cached copy is never stale. The shell (the entry, its imports, its CSS, the
  Latin fonts) is cached at install; the main screens' chunks only in an installed
  app (`WARM_ROUTES`), so a one-off visitor downloads nothing extra.
- **Everything else passes through**: the API, relays, link previews, thumbnails,
  share cards, video, and every path nginx answers itself. Data is the app's job
  (IndexedDB, the EventStore, react-query), not the worker's.
- **A new worker never takes over a running page by itself.** It waits; the page
  asks its build id. Same build as the page (the usual case, since page loads are
  network-first): swapped in quietly. Older page: "A new version is ready ·
  Reload", and the reader picks the moment, since a reload drops a half-typed message.
- **The worker is one file with no imports** (`client/src/sw/sw.ts`), transpiled on
  its own by the `service-worker` plugin in `vite.config.ts`, which stamps in the
  build id and file lists read off the bundle (`sw/precache.ts`).

## Not done here

- **Web Push** for a closed app. It needs a server that knows when a wrap arrives
  for someone and holds their push subscription: a backend project.
- **Offline data beyond what the app already keeps.** API answers aren't cached by
  the worker; screens offline show what IndexedDB and the event cache hold.
