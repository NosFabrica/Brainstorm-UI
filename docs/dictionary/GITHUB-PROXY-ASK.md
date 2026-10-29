# GitHub API proxy — the same-origin path the UI is wired for

**For:** brainstorm-k8s (the UI's nginx)
**From:** the UI, branch `feat/dlist-tier3-views`, 2026-10-12
**Modelled on:** `/link-preview`, which the same nginx already proxies to the link-preview
service (`services/unfurl`).

## What it's for

A GitHub account's own page (ADR 0007) shows what GitHub says about it: name, bio,
followers, repo count, last public activity, and its repos with stars and language. The
page asks **our origin**, never api.github.com, so that one upstream call serves every
reader for an hour, readers never contact GitHub, and GitHub's limit of 60 unauthenticated
calls an hour per address is spent by one cache, not by each reader. Until the path exists
the page simply shows the account as the list describes it; nothing breaks.

## The path

```
GET /github/users/{handle}
GET /github/users/{handle}/repos?per_page=100&sort=pushed
GET /github/users/{handle}/events/public?per_page=1
GET /github/users/{handle}/social_accounts
GET /github/gists/{id}
```

Proxy `/github/` to `https://api.github.com/`, stripping the prefix. Only `GET`, only
paths under `/users/` and `/gists/`; refuse the rest.

The last two (added on `feat/search-books-github-places`) are how search knows a GitHub
account and a Nostr profile are one person (`lib/githubLink`): the npub the account's owner
lists among their GitHub social accounts, and the gist a NIP-39 claim names. Until they're
proxied, the two stay separate rows in search — nothing breaks.

Suggested nginx (the UI's server block):

```nginx
location /github/ {
    if ($request_method != GET) { return 405; }
    proxy_pass https://api.github.com/;
    proxy_ssl_server_name on;
    proxy_set_header Host api.github.com;
    proxy_set_header User-Agent "Brainstorm-UI";
    proxy_set_header Accept "application/vnd.github+json";
    proxy_set_header Cookie "";
    # proxy_set_header Authorization "Bearer $GITHUB_TOKEN";   # later: 5,000/h, pinned repos, contribution graph
    proxy_cache github;                 # a small keys_zone, 10m is plenty
    proxy_cache_valid 200 1h;
    proxy_cache_valid 404 10m;
    proxy_cache_use_stale error timeout updating http_429 http_500 http_502 http_503;
    proxy_cache_lock on;
    proxy_hide_header Set-Cookie;
    add_header Cache-Control "public, max-age=300";
}
```

- **Cache by full URI** (the default key): the three paths above differ, and a handle is
  case-insensitive on GitHub but the UI lowercases nothing in the path, so `Vcavallo` and
  `vcavallo` are two entries. Fine.
- **A 429 from GitHub** should serve stale if there is any, else pass through; the UI
  treats anything but 200 as "nothing known".
- **Same-origin only** would be nice, as `/link-preview` does by `Sec-Fetch-Site`, but
  isn't required: the cache is the guard.
- **Dev:** Vite proxies `/github` to api.github.com directly (`vite.config.ts`), so local
  pages work without this.

## Later, with a token

A fine-grained token with no scopes raises the limit to 5,000 an hour and opens GraphQL,
which is where pinned repositories and the contribution calendar live. The UI would then
add `GET /github/graphql`-shaped reads through the same path; nothing about the page's
contract changes.
