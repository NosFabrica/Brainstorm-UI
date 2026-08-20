---
name: Testing pattern
description: How automated tests are written/run in this repo (vitest + @testing-library, plus legacy tsx static scripts).
---

# Testing pattern in this repo

There are **two** testing modes. Prefer vitest for anything with behavior; the
legacy `tsx` scripts remain only for static source-integrity checks.

## 1. Vitest + @testing-library (default)

A vitest harness was added 2026-07-06 (during the scheduling-admin-ui work — the
first real tests in the repo). This **superseded** the older "no test framework /
don't edit package.json" rule; editing `package.json` scripts is fine.

- Run: `npm test` (`vitest run`) or `npm run test:watch`. Single file:
  `npx vitest run <path>` — **from the `Brainstorm-UI/` dir** (the `@` alias +
  jsdom env come from `vitest.config.ts`; running from the workspace root fails to
  resolve `@/…`).
- Node: **24**, pinned in `.nvmrc` (`nvm use`); CI reads the same file via
  `actions/setup-node`'s `node-version-file`.
- Config: `vitest.config.ts` (root) — jsdom, `globals: false` (import
  `describe/it/expect` from `"vitest"`), `@`/`@assets` aliases, setup file
  `client/src/test/setup.ts`, include `client/src/**/*.test.{ts,tsx}`.
- `pool: "forks"` + `execArgv: ["--no-experimental-webstorage"]`: Node ≥25 enables
  Web Storage by default, and those native `localStorage`/`sessionStorage` globals
  shadow jsdom's, because vitest's `populateGlobal` skips any key already present on
  `globalThis`. Turning the flag off hands storage back to jsdom (real `Storage`, so
  bracket access and `clear()` behave, `sessionStorage` included). Needs Node ≥22.4 —
  on Node 20 the suite dies with `bad option`, which is why the pin is a floor.
- Setup (`client/src/test/setup.ts`): jest-dom matchers; sets `window.__ENV__`
  (`VITE_API_URL`, NIP-85 relay) **before** `api.ts` module-load captures it;
  clears `localStorage` per test; RTL `cleanup()` after each.
- Render helper: `client/src/test/utils.tsx` → `renderWithProviders(ui)` wraps a
  fresh `QueryClient` (retry off). Add a wouter `Router` here if a tested
  component routes.
- `tsconfig.json` excludes `**/*.test.ts(x)` + `client/src/test/**`, so
  `npm run check` (tsc) stays green; tests are transpiled by esbuild, not tsc.

**Mock seams:**
- API-client methods → stub `global.fetch` via `vi.stubGlobal("fetch", …)` and call
  `localStorage.setItem("brainstorm_session_token", …)` first (else `authenticatedFetch` hits
  the 401 → silent-reauth → `window.location = "/"` redirect path). Unstub in
  `afterEach` with `vi.unstubAllGlobals()`.
- Components → `vi.spyOn(apiClient, "method").mockResolvedValue(…)`; don't touch
  fetch. Restore with `vi.restoreAllMocks()`.

**jsdom gotchas learned the hard way:**
- A number `<input max={N}>` makes jsdom **silently drop** a `fireEvent.change`
  value above N — so validate bounds in zod/JS, not via the input `max` attr, or
  your test can't exercise the out-of-range case.
- Radix `Select` is unreliable under jsdom (pointer events) — use a native
  `<select>` when the value needs to be driven/asserted in tests.
- `<option>` text is queryable by `getByText`; if a `<select>` lists the same
  labels shown elsewhere (e.g. a table), disambiguate the option text (add a
  suffix) or scope queries, or `getByText` throws on multiple matches.

Reference tests: `client/src/components/admin/scheduling/*.test.tsx`,
`client/src/services/api.scheduling.test.ts`.

## 2. Legacy `tsx` static scripts (source-integrity only)

Still valid for checks that must **not** execute React/JSX or resolve the `@/`
alias — e.g. asserting page string-content matches a source-of-truth file.

- Pattern: a standalone TS/ESM script under `scripts/`, run with
  `npx tsx scripts/<name>.test.ts`. Parse `.tsx` with the TypeScript compiler API
  (`ts.createSourceFile`) and statically extract literals. Example:
  `scripts/legal-pages-integrity.test.ts`.
- ESM gotcha: no `__dirname`; derive with `fileURLToPath(import.meta.url)`.
- Use this mode only when a real render isn't wanted; otherwise write a vitest test.
