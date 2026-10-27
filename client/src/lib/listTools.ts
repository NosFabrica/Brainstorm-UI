/**
 * The list code other programs use, as one module: the checks List Management
 * runs on a header and its items, the drafts it writes, the prompt it copies
 * for an AI, the import it reads JSON with, the URL templates links are
 * built from, and the Dictionary's concepts.
 *
 * `npm run build:lists` builds this file and everything it imports into one
 * ES module that runs in Node (vite.lists.config.ts), so a program outside
 * this repo, such as the Tapestry connector, runs the same rules this app
 * does, pinned to the commit it was built at, rather than a copy of them.
 */
import dictionaryConfig from "@/config/dictionary.config.json";

export * from "@/lib/listCheck";
export * from "@/lib/listDraft";
export * from "@/lib/listPrompt";
export * from "@/lib/listImport";
export * from "@/lib/dictionaryConcepts";
export { similarTemplates, templateOf } from "@/lib/linkTemplates";
export type { UrlTemplate } from "@/lib/linkTemplates";

/**
 * The URL Templates concept, where the templates a header links through are
 * listed: the `url-templates` role, read from the JSON itself, because
 * config/dictionary also reads the tag relays from the env and the browser.
 */
export const URL_TEMPLATES_LIST: string = dictionaryConfig.roles["url-templates"];
