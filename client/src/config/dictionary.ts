/**
 * Which concepts the Dictionary shows and which plays a role the app relies
 * on (URL Templates) — the one place the app reads `dictionary.config.json`.
 * Not whose copies are Brainstorm's own: that's the house observer, discovered
 * from the server like everywhere else in the app (services/dictionary
 * `houseCopyAuthors`), never a key written here.
 *
 * The repo's rule for identifiers (config/tagging.config.json says it too):
 * a Nostr identifier that's the same on every deployment — a concept's
 * coordinate — is JSON config read through one module, never a literal in
 * code; what differs per deployment (relay and API URLs, flags) is a
 * VITE_* variable (lib/runtimeEnv). Adding URLs is an edit here. How a
 * concept's items are drawn is never here: that's its governing definition's
 * fields, display hints and URL templates (ADR 0004).
 */
import raw from "./dictionary.config.json";
import { parseCoordinate } from "@/lib/dlistFields";
import { tagRelays } from "@/config/tagging";

/** A job a concept does for the app beyond being shown: URL Templates' items are what links are built from. */
export type ConceptRole = "url-templates";

const config = raw as {
  concepts: { coordinate: string; ownVersion?: boolean; role?: ConceptRole; search?: boolean }[];
  displayHints?: boolean;
};

/** PROVISIONAL: whether renderers honour headers' presentation hints and links (lib/displayHints, lib/linkTemplates). */
export const DISPLAY_HINTS_ENABLED: boolean = config.displayHints === true;

const valid = config.concepts.filter((c) => parseCoordinate(c.coordinate)?.kind === 39998);

/** The community concepts on show, by header coordinate. A malformed entry is dropped, not shipped. */
export const DICTIONARY_CONCEPTS: string[] = valid.map((c) => c.coordinate);

/**
 * The concepts search can find items of when the words name the list
 * (lib/listSearch) — a flag per concept, so the next list is a line of config.
 */
export const SEARCHABLE_CONCEPTS: string[] = valid.filter((c) => c.search === true).map((c) => c.coordinate);

/** The concept that plays a role, if one is configured — resolved per reader like any other. */
export function conceptForRole(role: ConceptRole): string | null {
  return valid.find((c) => c.role === role)?.coordinate ?? null;
}

/** PROVISIONAL: URL Templates, the concept whose governing list the link picker offers (lib/linkTemplates). */
export const URL_TEMPLATES_CONCEPT: string | null = conceptForRole("url-templates");

/** Whether a concept's Dictionary entry offers "Publish my own version" (OwnVersionDialog). */
export function offersOwnVersion(coordinate: string): boolean {
  return valid.some((c) => c.coordinate === coordinate && c.ownVersion === true);
}

/**
 * The tag hub, where list events are published and read beside our index
 * (services/listReads). A function, as tagRelays is: Settings can change it.
 */
export function dictionaryRelays(): string[] {
  return tagRelays();
}
