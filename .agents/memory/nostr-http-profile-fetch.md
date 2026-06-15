---
name: Nostr profile fetch HTTP fast-path
description: How/why profile (kind 0) metadata is fetched over CORS HTTP gateways, not just relays, and the gateway response shapes.
---

# Nostr profile (kind 0) HTTP fast-path

`fetchProfile()` in `client/src/services/nostr.ts` races a CORS-enabled HTTP
fast-path against the websocket relay query and takes the first valid kind 0.

**Why:** There is **no Express backend** in this project — `npm run dev` runs
Vite only and production is a static file server (spaFallbackPlugin in
vite.config.ts). So every Nostr fetch happens directly from the browser; CORS
matters, and relays alone left the post-login avatar slow/empty. (The replit.md
mentions of an "Express proxy" / "HTTP fallback" are aspirational, not real —
git history has no prior HTTP profile fetch implementation.)

**Gateways used (both CORS-enabled, queried in parallel):**
- `https://nostrhttp.com/<npub>` → returns a **bare array** of nostr events:
  `[{ kind:0, content:"{...stringified profile...}" }]`. Also supports
  `?relay=wss://...&kinds=0&authors=<hex>&limit=1` (authors must be hex, not npub).
- `https://api.nostr.band/v0/stats/profile/<npub>` → wraps the event under
  `{ profiles: [ { event: { kind:0, content:"{...}" }, stats:{...} } ] }`.
  (The `stats` object alone does NOT carry name/picture — must read `.event`.)

**How to apply:**
- `extractKind0Content()` is a recursive JSON scanner: finds any object with
  `kind === 0` + string `content`, JSON.parses it. Handles both envelopes
  above and is resilient to shape drift — extend it, don't special-case.
- Use only the safelisted `Accept: application/json` header so the GET stays a
  CORS "simple request" (no OPTIONS preflight).
- `firstTruthy()` resolves with the first source yielding a truthy value, and
  only falls back to `undefined` once ALL settle — so HTTP-gateway downtime is
  never a regression; the relay path still wins independently.
- **Sandbox cannot reach these hosts** (curl/webFetch → HTTP 000); only the
  real browser can. Verify shapes via web search, then confirm in-browser.
