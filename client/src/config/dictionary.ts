/**
 * Which concepts the Dictionary shows, which renderer draws each, which
 * plays a role the app relies on (URL Templates), and whose copies are
 * Brainstorm's — the one place the app reads `dictionary.config.json`.
 *
 * The repo's rule for identifiers (config/tagging.config.json says it too):
 * a Nostr identifier that's the same on every deployment — a concept's
 * coordinate — is JSON config read through one module, never a literal in
 * code; what differs per deployment (relay and API URLs, flags) is a
 * VITE_* variable (lib/runtimeEnv). Adding URLs, or pointing a renderer at
 * a different concept, is an edit here.
 */
import raw from "./dictionary.config.json";
import { parseCoordinate } from "@/lib/dlistFields";
import { tagRelays } from "@/config/tagging";

/** A job a concept does for the app beyond being shown: URL Templates' items are what links are built from. */
export type ConceptRole = "url-templates";

const config = raw as {
  concepts: { coordinate: string; renderer?: string; ownVersion?: boolean; role?: ConceptRole }[];
  houseConceptAuthors: string[];
  displayHints?: boolean;
};

/** PROVISIONAL: whether renderers honour headers' presentation hints and links (lib/displayHints, lib/linkTemplates). */
export const DISPLAY_HINTS_ENABLED: boolean = config.displayHints === true;

const valid = config.concepts.filter((c) => parseCoordinate(c.coordinate)?.kind === 39998);

/** The community concepts on show, by header coordinate. A malformed entry is dropped, not shipped. */
export const DICTIONARY_CONCEPTS: string[] = valid.map((c) => c.coordinate);

/** The concept that plays a role, if one is configured — resolved per reader like any other. */
export function conceptForRole(role: ConceptRole): string | null {
  return valid.find((c) => c.role === role)?.coordinate ?? null;
}

/** PROVISIONAL: URL Templates, the concept whose governing list the link picker offers (lib/linkTemplates). */
export const URL_TEMPLATES_CONCEPT: string | null = conceptForRole("url-templates");

/** The renderer key registered for a concept coordinate, if Brainstorm has one. */
export function rendererKeyOf(coordinate: string): string | null {
  return valid.find((c) => c.coordinate === coordinate)?.renderer ?? null;
}

/** Whether a concept's Dictionary entry offers "Publish my own version" (OwnVersionDialog). */
export function offersOwnVersion(coordinate: string): boolean {
  return valid.some((c) => c.coordinate === coordinate && c.ownVersion === true);
}

/** Authors of Brainstorm's own copies. */
export const HOUSE_CONCEPT_AUTHORS: string[] = config.houseConceptAuthors;

/**
 * The tag hub, where list events are published and read beside our index
 * (services/listReads). A function, as tagRelays is: Settings can change it.
 */
export function dictionaryRelays(): string[] {
  return tagRelays();
}
