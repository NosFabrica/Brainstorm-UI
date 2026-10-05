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
  "^(fetchEventsByIds|fetchEventsByFilter|fetchEventsByAuthors|fetchAddressableEvents|fetchRecentByKinds|fetchLiveStreams|fetchNotesByHashtag|fetchContactList|fetchMuteList|fetchProfile|fetchProfileEvent|fetchProfileMap|refreshProfileEvent|fetchProfilePrefs|fetchOutboxRelayList|fetchTrustProviderList|fetchReportsForPubkey|fetchMyReport|loadDmRelays|loadDmRelaysFor|loadBlossomServers|requestAll|requestNewest|requestNewestWithReach|requestOne)$";
const QUERY_HOOKS =
  "^(useQuery|useQueries|useInfiniteQuery|useSuspenseQuery|prefetchQuery|fetchQuery|ensureQueryData)$";
const relayReadInQuery = (callee) => ({
  selector: `CallExpression[${callee}=/${QUERY_HOOKS}/] Property[key.name="queryFn"] CallExpression[callee.name=/${RELAY_FETCHERS}/]`,
  message:
    "Relay reads render from the EventStore (useStoreEvents / useStoreReplaceable / useLiveProfile), not react-query. See docs/adr.",
});

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
  prettier,
);
