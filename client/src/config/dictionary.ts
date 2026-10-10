/**
 * Where the Dictionary's concepts come from, and which concepts play a role
 * the app relies on (URL Templates) — the one place the app reads
 * `dictionary.config.json`.
 *
 * The concepts themselves aren't here (since 2026-10-10): they're entries on
 * the Demo Dictionary Concepts list, filed by curators — the people the house
 * tagged "Dictionary Concept Curator", and the list's own author — so adding
 * one is a publish, not a deploy (lib/dictionaryConcepts,
 * hooks/useDictionaryConcepts). Neither is the house: that's the house
 * observer, discovered from the server like everywhere else in the app
 * (services/trustSource), never a key written here.
 *
 * The repo's rule for identifiers (config/tagging.config.json says it too):
 * a Nostr identifier that's the same on every deployment — a list's or a
 * tag's coordinate — is JSON config read through one module, never a literal
 * in code; what differs per deployment (relay and API URLs, flags) is a
 * VITE_* variable (lib/runtimeEnv). How a concept's items are drawn is never
 * here: that's its governing definition's fields, display hints and URL
 * templates (ADR 0004).
 */
import raw from "./dictionary.config.json";
import { parseCoordinate } from "@/lib/dlistFields";
import { tagRelays } from "@/config/tagging";

/** A job a concept does for the app beyond being shown: URL Templates' items are what links are built from. */
export type ConceptRole = "url-templates";

const config = raw as {
  conceptList: string;
  curatorTag: string;
  roles: Partial<Record<ConceptRole, string>>;
};

/** The Demo Dictionary Concepts list: its entries name the concepts the Dictionary shows. */
export const CONCEPT_LIST: string = config.conceptList;

/** Its author, who counts as a curator without being tagged. */
export const CONCEPT_LIST_AUTHOR: string = parseCoordinate(config.conceptList)?.pubkey ?? "";

/** The tag the house applies to make someone a curator, by its address (`#a` on a person tagging). */
export const CURATOR_TAG: string = config.curatorTag;

/** The concept that plays a role, if one is configured — resolved per reader like any other. */
export function conceptForRole(role: ConceptRole): string | null {
  const coordinate = config.roles[role];
  return coordinate && parseCoordinate(coordinate)?.kind === 39998 ? coordinate : null;
}

/** PROVISIONAL: URL Templates, the concept whose governing list the link picker offers (lib/linkTemplates). */
export const URL_TEMPLATES_CONCEPT: string | null = conceptForRole("url-templates");

/**
 * Infrastructure: concepts that play a role. Their items render through them,
 * but the Dictionary doesn't list them and search doesn't name them.
 */
export const ROLE_CONCEPTS: string[] = (Object.keys(config.roles) as ConceptRole[])
  .map(conceptForRole)
  .filter((c): c is string => !!c);

/**
 * The tag hub, where list events are published and read beside our index
 * (services/listReads). A function, as tagRelays is: Settings can change it.
 */
export function dictionaryRelays(): string[] {
  return tagRelays();
}
