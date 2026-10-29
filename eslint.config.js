import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";
import pluginQuery from "@tanstack/eslint-plugin-query";

/**
 * Relay reads render from the EventStore, not from react-query (docs/adr). A
 * `queryFn` calling one of these is a relay read in the wrong cache. A relay
 * PROBE — "is it on that relay?" — may opt out with an
 * `eslint-disable-next-line no-restricted-syntax -- relay probe` comment.
 */
const RELAY_FETCHERS =
  "^(fetchEventsByIds|fetchEventsByFilter|fetchCollectionProducts|fetchEventsByAuthors|fetchAddressableEvents|fetchAddressableBatched|fetchRecentByKinds|fetchLiveStreams|fetchNotesByHashtag|fetchContactList|fetchMuteList|fetchProfile|fetchProfileEvent|fetchProfileMap|refreshProfileEvent|fetchProfilePrefs|fetchOutboxRelayList|fetchTrustProviderList|fetchReportsForPubkey|fetchMyReport|loadDmRelays|loadDmRelaysFor|loadBlossomServers|requestAll|requestNewest|requestNewestWithReach|requestOne|fetchPollResponses|fetchZapPollReceipts|isSearchObserverOnRelay)$";
const QUERY_HOOKS =
  "^(useQuery|useQueries|useInfiniteQuery|useSuspenseQuery|prefetchQuery|fetchQuery|ensureQueryData)$";
const relayReadInQuery = (callee) => ({
  selector: `CallExpression[${callee}=/${QUERY_HOOKS}/] Property[key.name="queryFn"] CallExpression[callee.name=/${RELAY_FETCHERS}/]`,
  message:
    "Relay reads render from the EventStore (useStoreEvents / useStoreReplaceable / useLiveProfile), not react-query. See docs/adr.",
});

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
      "no-restricted-syntax": ["error", relayReadInQuery("callee.name"), relayReadInQuery("callee.property.name")],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // `let x; ...; x = subscribe(...)` is deliberate where a sync callback reads x.
      "prefer-const": ["error", { ignoreReadBeforeAssign: true }],
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
