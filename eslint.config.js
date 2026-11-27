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
 * readAuthorRanks, …), and a name list kept by hand let every new one slip
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

/**
 * The write primitives: what signs or publishes an event. A function that
 * reaches one is a write, whatever it reads on the way (a contact list read
 * before a follow is republished, relay-first per docs/adr/0005): it is called
 * from an event handler, and its answer is the store's once a relay takes it.
 */
export const RELAY_WRITES = ["publishToRelays", "publish", "signAs"];

/** The relay reads that are not writes: grown from the primitives, less every write. */
export function relayReadsOnly(root = SOURCE_ROOT) {
  const writes = new Set(relayFetchers(root, RELAY_WRITES));
  return relayFetchers(root).filter((name) => !writes.has(name));
}
const RELAY_READS_ONLY = `^(${relayReadsOnly().join("|")})$`;
const QUERY_HOOKS =
  "^(useQuery|useQueries|useInfiniteQuery|useSuspenseQuery|prefetchQuery|fetchQuery|ensureQueryData)$";
const relayReadInQuery = (callee) => ({
  selector: `CallExpression[${callee}=/${QUERY_HOOKS}/] Property[key.name="queryFn"] CallExpression[callee.name=/${RELAY_FETCHERS}/]`,
  message:
    "Relay reads render from the EventStore (useStoreEvents / useStoreReplaceable / useLiveProfile), not react-query. See docs/adr.",
});

/**
 * Outside react-query too: in components/ and hooks/, a relay fetcher is called
 * only as the ask a store read makes (the callback handed to `useStoreEvents`,
 * `useStoreReplaceable`, `askOnce` and the hooks built on them), so what it
 * brings in renders from the EventStore. Called anywhere else (an effect, an
 * event handler, a plain call) its answer lands in component state, a second
 * copy of Nostr data beside the store. A write's read-modify-write and a relay
 * probe say so: `eslint-disable-next-line no-restricted-syntax -- relay probe`.
 */
export const STORE_ASKS = [
  "useStoreEvents",
  "useStoreReplaceable",
  "askOnce",
  "askAnswer",
  "useFiledItems",
  "useLensRanks",
  "useSearchEvents",
  "useStandingReviews",
  "useDictionaryEntries",
];
const STORE_ASK = `CallExpression[callee.name=/^(${STORE_ASKS.join("|")})$/]`;

/**
 * The store's own read layer: these files are the asks the hooks above run
 * (the profile queue, the batched addressable ask, a publication's entries),
 * called as a store ask from where they are used rather than inside one here.
 */
const STORE_READ_LAYER = ["hooks/useLiveProfile.ts", "hooks/useAddressedEvents.ts", "hooks/usePublication.ts"];

/**
 * Reads not yet on the store (docs/adr/0005, "Deferred"), by why. Each still
 * holds a relay answer in component state; lib/relayReadLint.test.ts fails for
 * an entry that no longer does, so the list only shrinks.
 */
export const DEFERRED_STORE_READS = {
  /** NIP-50 searches answered per keystroke or streamed in snapshots: the search page, its panel and the typeaheads. */
  search: [
    "components/FollowPicker.tsx",
    "components/FollowToCalculateCard.tsx",
    "components/admin/billing/brainstormUserSearch.ts",
    "components/admin/scheduling/AssignUsersDialog.tsx",
    "components/messages/usePeopleSearch.tsx",
    "components/search/AllResults.tsx",
    "components/search/KnowledgePanel.tsx",
    "components/search/SearchBox.tsx",
    "components/search/SearchField.tsx",
    "components/search/SearchResults.tsx",
    "components/search/sections.tsx",
    "components/share/ShareBio.tsx",
    "hooks/useListRibbon.ts",
    "hooks/useOnboardingPeople.ts",
  ],
  /** Tag reads, with hooks/useTags (services/tags interleaves them with the asserters' trust). */
  tags: [
    "components/search/TagTabResults.tsx",
    "hooks/useNamedTags.ts",
    "hooks/useResultTags.ts",
    "hooks/useSearchTags.ts",
    "hooks/useTabCounts.ts",
    "hooks/useTagMembers.ts",
    "hooks/useTaggedMusicians.ts",
  ],
  /** One-shot reads in an effect: each to become a store read with its answer (useStoreEvents' `answer`). */
  effects: [
    "components/admin/scheduling/usePolicyMembers.ts",
    "components/search/NowPlayingBar.tsx",
    "components/share/DesignationHero.tsx",
    "components/share/EventHero.tsx",
    "components/share/ListingRelated.tsx",
    "components/share/RsvpButton.tsx",
    "components/share/TrustReviews.tsx",
    "hooks/useAppEndorsements.ts",
    "hooks/useArtistCatalogue.ts",
    "hooks/useClientLink.ts",
    "hooks/useEventRsvps.ts",
    "hooks/useHandlePointers.ts",
    "hooks/useListDefinitions.ts",
    "hooks/usePersonContent.ts",
    "hooks/usePersonEndorsements.ts",
    "hooks/usePodcastIndexMusic.ts",
    "hooks/useSpecsForKind.ts",
  ],
};
const underSrc = (file) => `client/src/${file}`;
const relayReadOutsideStore = (callee) => ({
  selector: `CallExpression[${callee}=/${RELAY_READS_ONLY}/]:not(${STORE_ASK} CallExpression)`,
  message:
    "Relay reads render from the EventStore: call a relay fetcher as the ask of useStoreEvents / useStoreReplaceable / askOnce (docs/adr/0005). A write's read or a relay probe says so with `-- relay probe`.",
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
 * A person is named through lib/displayName (nameIn, displayNameOf,
 * profileName, resultName): `display_name`, then `name`, trimmed, a blank one
 * skipped. A hand-written `p.display_name || p.name || …` shows a blank
 * display name as an empty label, and each copy picks its own fallback.
 * Flagged: a kind-0's `display_name` as an operand of `||` or `??` (as it is,
 * optional, or cast), and a search hit's `displayName` beside a `name`.
 * Not flagged: `display_name ?? ""`, the field read as text to search in.
 */
const NAME_OR = "LogicalExpression[operator=/^(\\|\\||\\?\\?)$/]";
const OPERAND = ["", "ChainExpression > ", "TSAsExpression > ", "TSAsExpression > ChainExpression > "];
const member = (name) => OPERAND.map((via) => `${via}MemberExpression[property.name="${name}"]`);
const HAND_WRITTEN_NAMES = [
  {
    selector: member("display_name")
      .map((m) => `${NAME_OR}:not(:has(> Literal[value=""])) > ${m}`)
      .join(", "),
    message: "Name a person through lib/displayName (nameIn, displayNameOf, profileName), not display_name || name.",
  },
  {
    // left and right as they are or optional (`a?.displayName`: a ChainExpression around it).
    selector: ["", ".expression"]
      .flatMap((l) =>
        ["", ".expression"].map(
          (r) => `${NAME_OR}[left${l}.property.name="displayName"][right${r}.property.name="name"]`,
        ),
      )
      .join(", "),
    message: "Name a search hit through resultName or getDisplayLabel (lib/displayName), not displayName || name.",
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
        ...HAND_WRITTEN_NAMES,
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
  // Components and hooks: a relay fetcher only as a store read's ask, anywhere (docs/adr/0005),
  // but in the store's read layer and the reads still deferred.
  {
    files: ["client/src/components/**/*.{ts,tsx}", "client/src/hooks/**/*.{ts,tsx}"],
    ignores: [
      "client/src/**/*.test.{ts,tsx}",
      ...STORE_READ_LAYER.map(underSrc),
      ...Object.values(DEFERRED_STORE_READS).flat().map(underSrc),
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        relayReadInQuery("callee.name"),
        relayReadInQuery("callee.property.name"),
        relayReadOutsideStore("callee.name"),
        relayReadOutsideStore("callee.property.name"),
        ...RAW_TAG_LINKS,
        ...HAND_WRITTEN_NAMES,
      ],
    },
  },
  // Tags (deferred): docs/adr/0005 keeps hooks/useTags' relay reads in react-query for now.
  { files: ["client/src/hooks/useTags.ts"], rules: { "no-restricted-syntax": "off" } },
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
