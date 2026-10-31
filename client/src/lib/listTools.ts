/**
 * The list code other programs use, as one module: the checks List Management
 * runs on a header and its items, the drafts it writes, the prompt it copies
 * for an AI, the import it reads JSON with, the URL templates links are
 * built from, the Dictionary's concepts, and the search box's grammar.
 *
 * `npm run build:lists` builds this file and everything it imports into one
 * ES module that runs in Node (vite.lists.config.ts), so a program outside
 * this repo, such as the Tapestry connector, runs the same rules this app
 * does, pinned to the commit it was built at, rather than a copy of them.
 */
import dictionaryConfig from "@/config/dictionary.config.json";
import { parseCoordinate } from "@/lib/dlistFields";

export * from "@/lib/listCheck";
export * from "@/lib/listDraft";
export * from "@/lib/listPrompt";
export * from "@/lib/listImport";
export * from "@/lib/dictionaryConcepts";
export { similarTemplates, templateOf } from "@/lib/linkTemplates";
export type { UrlTemplate } from "@/lib/linkTemplates";
// The search box's grammar (A6.13.a), so a program outside the app asks the search relay as
// the box does: the prefixes become NIP-01 filter fields, and the search text carries only
// words and the relay's own tokens, with the lens the page reads through.
export { buildFilters, parseQuery } from "@/lib/searchQuery";
export type { BuildOptions, ParsedQuery } from "@/lib/searchQuery";
export { withObserver } from "@/lib/searchSyntax";

// The Dictionary's config, read from the JSON itself, as config/dictionary
// reads it: that module also reads the tag relays from the env and the
// browser, which a program outside the app doesn't have.

/** The URL Templates concept, where the templates a header links through are listed: the `url-templates` role. */
export const URL_TEMPLATES_LIST: string = dictionaryConfig.roles["url-templates"];

/** The tag that makes someone a Dictionary curator when the house applies it (`curatorsOf`). */
export const CURATOR_TAG: string = dictionaryConfig.curatorTag;

/** The concepts that play a role, such as URL Templates: the Dictionary keeps them out of its view. */
export const ROLE_CONCEPTS: string[] = Object.values(dictionaryConfig.roles).filter(
  (c) => parseCoordinate(c)?.kind === 39998,
);
