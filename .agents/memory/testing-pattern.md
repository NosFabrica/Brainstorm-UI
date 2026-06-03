---
name: Testing pattern (no test runner)
description: How automated tests are written/run in this repo, which has no vitest/jest.
---

# Testing pattern in this repo

There is **no test framework** installed (no vitest/jest/mocha) and `package.json`
scripts must not be edited (only `dev`, `build`, `check`=tsc). `tsx` and `esbuild`
are available in `node_modules`.

**Pattern:** write a standalone runnable script under `scripts/` (TypeScript, ESM)
and run it with `npx tsx scripts/<name>.ts`. Register it as a CI-style check via
the `validation` skill (`setValidationCommand` + `startValidationRun`) so it runs
on task completion.

**Why:** can't add a runner without editing package.json; tsx runs TS/ESM directly.

**Gotchas:**
- The project is ESM (`"type": "module"` effectively — vite/ESNext). `__dirname`
  is not defined; derive it with `fileURLToPath(import.meta.url)`.
- To read content out of `.tsx` page files without executing React/JSX, parse the
  source with the TypeScript compiler API (`ts.createSourceFile`) and statically
  extract string literals. This is immune to reformatting and avoids resolving the
  `@/` alias or pulling in framer-motion/wouter/etc. Example:
  `scripts/legal-pages-integrity.test.ts`.
