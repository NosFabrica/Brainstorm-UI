import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";
import pluginQuery from "@tanstack/eslint-plugin-query";
import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { URL, fileURLToPath } from "node:url";

/**
 * Relay reads render from the EventStore, not from react-query (docs/adr). A
 * `queryFn` calling one of these is a relay read in the wrong cache. A relay
 * PROBE — "is it on that relay?" — may opt out with an
 * `eslint-disable-next-line no-restricted-syntax -- relay probe` comment.
 *
 * `RELAY_READS` are the primitives: the fetchers and the raw `relay.req`. A
 * wrapper around one is a relay read too (fetchItemReactions, loadConceptItems,
 * fetchAuthorRanks, …), and a name list kept by hand let every new one slip
 * past, so the list the rule uses is grown from these: every function in
 * client/src/services and client/src/lib that calls one, however many hops
 * down (`relayFetchers` below, pinned by lib/relayReadLint.test.ts). A new
 * primitive joins `RELAY_READS`; a wrapper needs nothing.
 */
export const RELAY_READS = [
  "fetchEventsByIds",
  "fetchEventsByFilter",
  "fetchCollectionProducts",
  "fetchEventsByAuthors",
  "fetchAddressableEvents",
  "fetchAddressableBatched",
  "fetchRecentByKinds",
  "fetchLiveStreams",
  "fetchNotesByHashtag",
  "fetchContactList",
  "fetchMuteList",
  "fetchProfile",
  "fetchProfileEvent",
  "fetchProfileMap",
  "refreshProfileEvent",
  "fetchProfilePrefs",
  "fetchOutboxRelayList",
  "fetchTrustProviderList",
  "fetchReportsForPubkey",
  "fetchMyReport",
  "loadDmRelays",
  "loadDmRelaysFor",
  "loadBlossomServers",
  "requestAll",
  "requestAllByRelay",
  "requestNewest",
  "requestNewestWithReach",
  "requestOne",
  "fetchPollResponses",
  "fetchZapPollReceipts",
  "isSearchObserverOnRelay",
  "querySearchRelay",
  "fetchFromSearchRelayByFilters",
  "searchOnce",
  "loadReplaceable",
  // A socket's own REQ (lib/searchRelay's relays, `pool.relay(url)`).
  "req",
];

const SOURCE_ROOT = fileURLToPath(new URL("./client/src/", import.meta.url));

/**
 * Every function name in services/ and lib/ that reads relays: the primitives,
 * and each function that calls one, transitively. A file's private helpers
 * count within that file only, so two files' `ask` don't stand for each other.
 */
export function relayFetchers(root = SOURCE_ROOT, reads = RELAY_READS) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path);
    }
  };
  for (const dir of ["services", "lib"]) walk(join(root, dir));
  const fns = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false);
    const add = (name, body, exported) => {
      const calls = new Set();
      const visit = (node) => {
        if (ts.isCallExpression(node)) {
          const callee = node.expression;
          if (ts.isIdentifier(callee)) calls.add(callee.text);
          else if (ts.isPropertyAccessExpression(callee)) calls.add(callee.name.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(body);
      fns.push({ key: exported ? name : `${file}#${name}`, name, exported, file, calls });
    };
    for (const statement of source.statements) {
      const exported = !!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body)
        add(statement.name.text, statement.body, exported);
      else if (ts.isVariableStatement(statement))
        for (const d of statement.declarationList.declarations)
          if (
            ts.isIdentifier(d.name) &&
            d.initializer &&
            (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
          )
            add(d.name.text, d.initializer, exported);
    }
  }
  const found = new Set(reads);
  for (let grew = true; grew;) {
    grew = false;
    for (const fn of fns) {
      if (found.has(fn.key)) continue;
      if ([...fn.calls].some((c) => found.has(c) || found.has(`${fn.file}#${c}`))) {
        found.add(fn.key);
        grew = true;
      }
    }
  }
  return [...found].filter((key) => !key.includes("#")).sort();
}

const RELAY_FETCHERS = `^(${relayFetchers().join("|")})$`;
const QUERY_HOOKS =
  "^(useQuery|useQueries|useInfiniteQuery|useSuspenseQuery|prefetchQuery|fetchQuery|ensureQueryData)$";
const relayReadInQuery = (callee) => ({
  selector: `CallExpression[${callee}=/${QUERY_HOOKS}/] Property[key.name="queryFn"] CallExpression[callee.name=/${RELAY_FETCHERS}/]`,
  message:
    "Relay reads render from the EventStore (useStoreEvents / useStoreReplaceable / useLiveProfile), not react-query. See docs/adr.",
});

/**
 * A link straight from an event's tags. React puts any string into href, so a
 * `javascript:` url someone wrote runs on our origin when it's clicked: a tag
 * goes through safeHref (lib/safeHref) or a reader that checks it first, never
 * into href or an iframe's src as it is.
 */
const TAG_READERS = "^(tagVal|tagOf|tagValue|tagValues|tagVals|firstTag)$";
/** The tag read is the attribute's value: as it is, after `??`/`||`, either arm of `?:`, or with a `!`. */
const rawTagIn = (attribute) =>
  ["", "LogicalExpression > ", "ConditionalExpression > ", "TSNonNullExpression > "]
    .map((via) => `${attribute} > JSXExpressionContainer > ${via}CallExpression[callee.name=/${TAG_READERS}/]`)
    .join(", ");
const RAW_TAG_LINKS = [
  {
    selector: rawTagIn('JSXAttribute[name.name="href"]'),
    message: "An event's tag goes into href through safeHref (lib/safeHref), never as it is.",
  },
  {
    selector: rawTagIn('JSXOpeningElement[name.name="iframe"] > JSXAttribute[name.name="src"]'),
    message: "An event's tag goes into an iframe's src through safeHref (lib/safeHref), never as it is.",
  },
];

/**
 * Tier two never imports tier three (docs/adr/0007): nothing outside
 * components/items/ reaches into it, and only it asks which concept has a
 * view of its own. Tier three plugs in from above, in three places: the app's
 * root (TierThreeProvider), and an item's page (ItemPage, in EventScreen and
 * the renderer playground). `allow` names the one module a wiring site may import.
 */
const TIER_THREE = "^(@/|(\\.\\./)+)(components/)?items/";
const tierTwoImports = (allow) => [
  "error",
  {
    paths: [
      {
        name: "@/config/dictionary",
        importNames: ["conceptViewOf", "ConceptViewKey"],
        message:
          "Only components/items/ asks which concept has a view of its own: tier two never branches on a concept (docs/adr/0007).",
      },
    ],
    patterns: [
      {
        regex: allow ? `${TIER_THREE}(?!${allow}$)` : TIER_THREE,
        message:
          "Tier two doesn't import tier three (docs/adr/0007, CODING_STANDARDS.md). Tier three plugs in from above: ItemPage for an item's page, TierThreeProvider for cards, rows and tiles.",
      },
    ],
  },
];

export default tseslint.config(
  {
    ignores: ["client/src/components/ui", "client/src/lib/tagging-sdk"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "@tanstack/query": pluginQuery },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "@tanstack/query/exhaustive-deps": "error",
      "no-restricted-syntax": [
        "error",
        relayReadInQuery("callee.name"),
        relayReadInQuery("callee.property.name"),
        ...RAW_TAG_LINKS,
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `let x; ...; x = subscribe(...)` is deliberate where a sync callback reads x.
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
    },
  },
  // Type-aware rules: promises nobody waits on or that land where a void
  // callback is expected, a `switch` that misses a case of its union, and
  // `await` on something that isn't a promise. Sources only: the tests are
  // outside tsconfig.json's project, and so is the code lib/relayReadLint.test.ts
  // lints as text under a made-up `__name__` file.
  {
    files: ["client/src/**/*.{ts,tsx}"],
    ignores: ["client/src/**/*.test.{ts,tsx}", "client/src/test/**", "client/src/**/__*__.{ts,tsx}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": ["error", {}],
      "@typescript-eslint/await-thenable": "error",
    },
  },
  // Tags (deferred): docs/adr/0005 keeps hooks/useTags' relay reads in react-query for now.
  { files: ["client/src/hooks/useTags.ts"], rules: { "no-restricted-syntax": "off" } },
  // Relay reads in a queryFn that the wrapper-aware list above found
  // (2026-11-25), warned rather than failed until each has a store-backed
  // read to move onto. Not a small move for any of them:
  // - growth/GrowthCard: fetchAuthorRanks, which resolves the house
  //   observer's kind 10040 first (services/trustSource), as hooks/useWotItems
  //   does; ranks aren't on the store yet.
  // - dictionary/useUserDictionary and dev/RendererPlayground's quick picks:
  //   loadDictionary, which assembles concept headers, copies and items from
  //   several reads (services/dictionary); the Settings tab reads it the same way.
  {
    files: [
      "client/src/components/admin/growth/GrowthCard.tsx",
      "client/src/components/admin/dictionary/useUserDictionary.ts",
      "client/src/pages/dev/RendererPlayground.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["warn", relayReadInQuery("callee.name"), relayReadInQuery("callee.property.name")],
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    ignores: ["client/src/components/items/**"],
    rules: { "no-restricted-imports": tierTwoImports() },
  },
  { files: ["client/src/App.tsx"], rules: { "no-restricted-imports": tierTwoImports("TierThreeProvider") } },
  {
    files: ["client/src/components/share/EventScreen.tsx", "client/src/pages/dev/RendererPlayground.tsx"],
    rules: { "no-restricted-imports": tierTwoImports("ItemPage") },
  },
  prettier,
);
