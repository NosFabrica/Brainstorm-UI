# tagging-sdk — VENDORED. Do not edit.

Verbatim copy of `integration-kits/nosfabrica-tagging/core/sdk/` from
`nous-clawds4/tapestry`, branch `generate-nosfabrica-integration-kit`,
commit `8412198053c5916377724a9a2960db8d5bd67407` (vendored 2026-08-05).

**Why it's committed here** rather than imported from the sibling clone at
`/Users/benjamin/Desktop/tapestry`: the build must never depend on someone
having that checkout. Anyone who clones Brainstorm-UI gets a working build.

**Why it's still JavaScript** in a strict-TypeScript project: keeping it
byte-identical to upstream is what makes it re-vendorable. Rewriting it in TS
forks it permanently. Types come from the hand-written `.d.ts` files beside the
entry points we actually import (`profile-tagging.d.ts`, `trust.d.ts`,
`event-tagging/index.d.ts`) — TypeScript reads those and never looks at the
`.js`, while Vite loads the `.js` at runtime.

## Rules

- **Never edit a `.js` file in this folder.** Fixes and features go upstream;
  then re-vendor.
- Adapter code — anything that knows about our relays, our signer, React Query,
  or our UI — belongs in `client/src/services/tags.ts`, not here.
- The `.d.ts` files are ours. They describe only the surface we call. Widen them
  as we start using more of the SDK.

## Re-vendoring

```
cp -R /Users/benjamin/Desktop/tapestry/integration-kits/nosfabrica-tagging/core/sdk/. client/src/lib/tagging-sdk/
```

Then re-check the `.d.ts` files against the new JSDoc and bump the commit hash
above. Deployment values live in `client/src/config/tagging.config.json` (also
copied from the kit) — not in this folder.
