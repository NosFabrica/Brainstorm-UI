/**
 * How one list item reads — title, summary, picture, and the list's own
 * image — from its governing definition (ADR 0004). The item page uses it;
 * the card and the search popup will, so the three agree.
 *
 * Who decides, strongest first:
 * - the definition's provisional display hints (lib/displayHints), when on;
 * - a Brainstorm renderer registered for the concept (its title field);
 * - the definition itself: the first required field is the title, a
 *   declared `summary` or `description` is the summary.
 * The header's author beats Brainstorm's code: a hint is the author's say.
 *
 * Chosen per definition, never per item: an item missing its title field
 * reads "Untitled <singular>" rather than borrowing another field, so the
 * same field always fills the same slot down a list (the team, 2026-10-02).
 */
import { DISPLAY_HINTS_ENABLED } from "@/config/dictionary";
import { fieldCell, httpUrl } from "@/lib/dlistFields";
import { NO_HINTS } from "@/lib/displayHints";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import type { ConceptRenderer } from "@/lib/conceptRenderers";

export interface ItemPresentation {
  title: string | null;
  /** The field the title came from, so a page needn't repeat it. */
  titleField: string | null;
  summary: string | null;
  summaryField: string | null;
  /** The item's own picture, an http(s) URL. */
  image: string | null;
  imageField: string | null;
  /** The list's image, worn by every item. */
  listImage: string | null;
}

const SUMMARY_NAMES = ["summary", "description"];

export function presentItem(
  item: { tags: string[][] },
  definition: ConceptDefinition,
  renderer: ConceptRenderer | null,
  hintsOn: boolean = DISPLAY_HINTS_ENABLED,
): ItemPresentation {
  const hints = hintsOn ? definition.display : NO_HINTS;
  const fields = definition.fields;
  const valueOf = (name: string | null) => {
    const decl = name ? fields.find((f) => f.name === name) : undefined;
    return decl ? fieldCell(item, decl).value : null;
  };
  const declared = (name: string | null | undefined) => (name && fields.some((f) => f.name === name) ? name : null);

  const titleField =
    hints.title ??
    declared(renderer?.titleField) ??
    fields.find((f) => f.requirement === "required")?.name ??
    fields[0]?.name ??
    null;
  const summaryField =
    hints.summary ?? SUMMARY_NAMES.map((n) => declared(n)).find((n) => n && n !== titleField) ?? null;

  return {
    title: valueOf(titleField),
    titleField,
    summary: summaryField === titleField ? null : valueOf(summaryField),
    summaryField,
    image: httpUrl(valueOf(hints.image)),
    imageField: hints.image,
    listImage: hints.listImage,
  };
}
