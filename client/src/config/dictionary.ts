/**
 * Which concepts the Dictionary shows, which renderer draws each, and whose
 * copies are Brainstorm's — the one place the app reads
 * `dictionary.config.json`. Coordinates are config, not code: adding URLs,
 * or pointing a renderer at a different concept, is an edit here.
 */
import raw from "./dictionary.config.json";
import { parseCoordinate } from "@/lib/dlistFields";
import { tagRelays } from "@/config/tagging";

const config = raw as {
  concepts: { coordinate: string; renderer?: string; versionTester?: boolean }[];
  houseConceptAuthors: string[];
  displayHints?: boolean;
};

/** PROVISIONAL: whether renderers honour headers' presentation hints (lib/displayHints). */
export const DISPLAY_HINTS_ENABLED: boolean = config.displayHints === true;

const valid = config.concepts.filter((c) => parseCoordinate(c.coordinate)?.kind === 39998);

/** The community concepts on show, by header coordinate. A malformed entry is dropped, not shipped. */
export const DICTIONARY_CONCEPTS: string[] = valid.map((c) => c.coordinate);

/** The renderer key registered for a concept coordinate, if Brainstorm has one. */
export function rendererKeyOf(coordinate: string): string | null {
  return valid.find((c) => c.coordinate === coordinate)?.renderer ?? null;
}

/** Whether a concept offers the temporary "Publish my own version" tester. */
export function hasVersionTester(coordinate: string): boolean {
  return valid.some((c) => c.coordinate === coordinate && c.versionTester === true);
}

/** Authors of Brainstorm's own copies. */
export const HOUSE_CONCEPT_AUTHORS: string[] = config.houseConceptAuthors;

/**
 * Where concepts and their items are read: the tag hub, where the
 * community headers and Tapestry Assistants publish (tapestry's DList relay
 * default). A function, as tagRelays is: Settings can change it.
 */
export function dictionaryRelays(): string[] {
  return tagRelays();
}
