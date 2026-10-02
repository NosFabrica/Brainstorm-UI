/**
 * Which definition of a concept governs what the reader sees. A concept is
 * a kind-39998 header (lib/dlistFields); a **community concept** is one
 * other people's headers point at, and a **local copy** is someone's own
 * header pointing at it with `["b", <community coordinate>, <type>]`.
 *
 * Renderers never read the community header directly. They are handed the
 * governing definition — the reader's own copy when they have one — with the
 * community's beside it, and whether the two agree. Today nobody can edit
 * their copy, so every copy agrees; the day someone can, the renderer is
 * already drawing from their copy and the reader is told it differs. Reading
 * only the community header would work now and quietly make every copy
 * decorative — the shortcut this module exists to rule out (the team,
 * 2026-10-01).
 *
 * Precedence, after tapestry's assistant-designation draft: the reader's
 * personally signed copy, then the one their Tapestry Assistant authored,
 * then Brainstorm's own (the house's — the concept its renderers are built
 * for), then the community header itself. Never by timestamp across
 * authors: a stale assistant must not shadow a deliberate edit.
 *
 * `chain` lists the coordinates a renderer may be registered for, from the
 * governing copy out to the community concept, so "render this with
 * Brainstorm's renderer for GitHub Accounts" holds for any copy that points
 * there — and pointing at someone else's definition later is one more link.
 */
import { coordinateOf, headerNames, parseFieldDecls, type FieldDecl } from "@/lib/dlistFields";
import { parseDisplayHints, sameHints, type DisplayHints } from "@/lib/displayHints";
import { linkTags, parseLinkRefs, type LinkRef } from "@/lib/linkTemplates";

export type BType = "pointer" | "inherit" | "inherit-items";

/** The `b` value meaning "deliberately not affiliated" — never a link. */
export const B_DEFERRED = "b-tag-deferred";

export interface BLink {
  target: string;
  type: BType;
}

export interface HeaderEvent {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
  content?: string;
}

export type DefinitionSource = "personal" | "assistant" | "house" | "community";

export interface ConceptDefinition {
  coordinate: string;
  event: HeaderEvent;
  singular: string;
  plural: string;
  description: string | null;
  fields: FieldDecl[];
  /** Provisional presentation hints (lib/displayHints): which field is the title, and so on. */
  display: DisplayHints;
  /** Provisional links built from URL templates (lib/linkTemplates). */
  links: LinkRef[];
}

/** What a copy changed from the community concept. Wording counts: it is what the reader reads. */
export type Difference = "names" | "description" | "fields" | "display" | "links";

/**
 * `no-local-copy`: the community header governs because nobody's copy applies.
 * `unknown`: a copy governs but the community header couldn't be fetched to compare.
 */
export type Agreement = "agrees" | "differs" | "no-local-copy" | "unknown";

export interface ResolvedConcept {
  /** The shared concept, when its header was found. */
  community: ConceptDefinition | null;
  /** The definition the reader sees: fields, names, renderer. */
  governing: ConceptDefinition;
  source: DefinitionSource;
  agreement: Agreement;
  differences: Difference[];
  /** Coordinates a renderer may be registered for, governing first. */
  chain: string[];
}

export interface ConceptCandidates {
  /** The community header, or null when it couldn't be fetched. */
  community: HeaderEvent | null;
  /** The community concept's coordinate — known even when its header isn't. */
  communityCoordinate: string;
  /** The reader's own copy, signed with their key. */
  personal?: HeaderEvent | null;
  /** The copy their Tapestry Assistant authored. */
  assistant?: HeaderEvent | null;
  /** Brainstorm's copy. */
  house?: HeaderEvent | null;
}

const B_TYPES = new Set<string>(["pointer", "inherit", "inherit-items"]);

/**
 * A header's affiliations. An absent or unknown type reads as `pointer`
 * (tapestry inherit-from draft); the deferred sentinel is not a link.
 */
export function bLinksOf(header: { tags: string[][] }): BLink[] {
  return header.tags
    .filter((t) => t[0] === "b" && typeof t[1] === "string" && t[1] && t[1] !== B_DEFERRED)
    .map((t) => ({ target: t[1], type: (B_TYPES.has(t[2] ?? "") ? t[2] : "pointer") as BType }));
}

/** Whether a header affiliates with this coordinate, by any type. */
export function pointsAt(header: { tags: string[][] }, coordinate: string): boolean {
  return bLinksOf(header).some((b) => b.target === coordinate);
}

/** A header that points at itself declares itself a shared concept. */
export function isSelfDeclared(header: HeaderEvent): boolean {
  const own = coordinateOf(header);
  return !!own && pointsAt(header, own);
}

export function definitionOf(header: HeaderEvent): ConceptDefinition {
  const { singular, plural, description } = headerNames(header);
  const fields = parseFieldDecls(header);
  return {
    coordinate: coordinateOf(header) ?? header.id,
    event: header,
    singular,
    plural,
    description,
    fields,
    display: parseDisplayHints(header, fields),
    links: parseLinkRefs(
      header,
      fields.map((f) => f.name),
    ),
  };
}

/** What a copy changed. Field descriptions are wording within a field; a field is its name, requirement and type. */
export function differencesBetween(copy: ConceptDefinition, community: ConceptDefinition): Difference[] {
  const out: Difference[] = [];
  if (copy.singular !== community.singular || copy.plural !== community.plural) out.push("names");
  if ((copy.description ?? "") !== (community.description ?? "")) out.push("description");
  const shape = (d: ConceptDefinition) => JSON.stringify(d.fields.map((f) => [f.name, f.requirement, f.type]));
  if (shape(copy) !== shape(community)) out.push("fields");
  // Which field reads as the title, the list's image: a copy that changes them changes how items look.
  if (!sameHints(copy.display, community.display)) out.push("display");
  if (JSON.stringify(linkTags(copy.links)) !== JSON.stringify(linkTags(community.links))) out.push("links");
  return out;
}

/**
 * The governing definition of one community concept for one reader. A
 * candidate copy counts only when it points at the community concept —
 * a header that happens to share its `d` is someone else's concept.
 * Null when there is nothing to show: no copy and no community header.
 */
export function resolveConcept(c: ConceptCandidates): ResolvedConcept | null {
  const community = c.community ? definitionOf(c.community) : null;
  const ranked: [DefinitionSource, HeaderEvent | null | undefined][] = [
    ["personal", c.personal],
    ["assistant", c.assistant],
    ["house", c.house],
  ];
  const hit = ranked.find(([, h]) => h && pointsAt(h, c.communityCoordinate));
  if (!hit) {
    if (!community) return null;
    return {
      community,
      governing: community,
      source: "community",
      agreement: "no-local-copy",
      differences: [],
      chain: [community.coordinate],
    };
  }
  const [source, header] = hit as [DefinitionSource, HeaderEvent];
  const governing = definitionOf(header);
  const differences = community ? differencesBetween(governing, community) : [];
  return {
    community,
    governing,
    source,
    agreement: !community ? "unknown" : differences.length ? "differs" : "agrees",
    differences,
    chain: [...new Set([governing.coordinate, c.communityCoordinate])],
  };
}
