# Open Library proxy — the same-origin path the UI is wired for

**For:** brainstorm-k8s (the UI's nginx)
**From:** the UI, branch `feat/book-view`, 2026-10-12
**Modelled on:** `/github/` (`GITHUB-PROXY-ASK.md`) and `/link-preview`.

## What it's for

A book's own page (ADR 0007, tier three) shows what Open Library says about it: the
subtitle, a description, the publisher and date, the page count, and how readers there
rated it. The page asks **our origin**, never openlibrary.org, so one upstream call serves
every reader for a day, readers never contact the site, and its request limits are spent
by one cache. Until the path exists the page shows the book as the list describes it —
cover, title, author, year, subjects — and nothing breaks. Search never asks: results draw
from the item alone.

## The path

```
GET /openlibrary/isbn/{isbn}.json            → 302 to /books/{edition}.json; follow it
GET /openlibrary/works/{id}.json
GET /openlibrary/works/{id}/ratings.json
```

Proxy `/openlibrary/` to `https://openlibrary.org/`, stripping the prefix. Only `GET`,
only paths under `/isbn/`, `/books/` and `/works/`; refuse the rest. The ISBN path answers
with a redirect to the edition; follow it upstream (`proxy_intercept_errors` won't do, so
either resolve the redirect in nginx with a named location, or let the browser follow it
— the UI follows redirects within `/openlibrary/`, so rewriting `Location` from
`https://openlibrary.org/books/…` to `/openlibrary/books/…` is enough).

Suggested nginx (the UI's server block):

```nginx
location /openlibrary/ {
    if ($request_method != GET) { return 405; }
    proxy_pass https://openlibrary.org/;
    proxy_ssl_server_name on;
    proxy_set_header Host openlibrary.org;
    proxy_set_header User-Agent "Brainstorm-UI (brainstorm.world)";
    proxy_set_header Accept "application/json";
    proxy_set_header Cookie "";
    proxy_redirect https://openlibrary.org/ /openlibrary/;
    proxy_cache openlibrary;            # a small keys_zone, 10m is plenty
    proxy_cache_valid 200 302 24h;
    proxy_cache_valid 404 1h;
    proxy_cache_use_stale error timeout updating http_429 http_500 http_502 http_503;
    proxy_cache_lock on;
    proxy_hide_header Set-Cookie;
    add_header Cache-Control "public, max-age=3600";
}
```

- **Covers** (`covers.openlibrary.org/b/id/….jpg`) go through the image proxy like every
  other picture; nothing new there.
- **A 429 or 503** should serve stale if there is any, else pass through; the UI treats
  anything but 200 as "nothing known".
- **Dev:** Vite proxies `/openlibrary` to openlibrary.org directly (`vite.config.ts`), so
  local pages work without this.
