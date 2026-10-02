import { useItemConcept } from "@/hooks/useItemConcept";
import { useLinkTemplates } from "@/hooks/useLinkTemplates";
import { DISPLAY_HINTS_ENABLED } from "@/config/dictionary";
import { fieldCell } from "@/lib/dlistFields";
import { rendererFor, type ConceptRenderer } from "@/lib/conceptRenderers";
import { presentItem, type ItemPresentation } from "@/lib/itemPresentation";
import { itemLinks } from "@/lib/linkTemplates";
import type { ResolvedConcept } from "@/lib/conceptResolution";

export interface ViewLink {
  label: string;
  href: string;
  host: string;
  /** A URL template the definition names, or the registered renderer's fallback. */
  source: "template" | "renderer";
}

export interface ItemView {
  pending: boolean;
  /** Null once settled: no definition could be read. */
  resolved: ResolvedConcept | null;
  renderer: ConceptRenderer | null;
  shown: ItemPresentation | null;
  links: ViewLink[];
  /**
   * The declared fields the presentation shows — the title, summary and picture
   * fields, and the fields its links are built from. A page lists only the rest.
   */
  usedFields: Set<string>;
}

/** A view whose definition was read: what the renderers draw. */
export type ReadyItemView = ItemView & { resolved: ResolvedConcept; shown: ItemPresentation };

export const isReady = (v: ItemView): v is ReadyItemView => !!v.resolved && !!v.shown;

/**
 * Everything a list item's renderers draw from — the page, the results
 * card, the search popup row — so the three can't disagree: the governing
 * definition (ADR 0004), the renderer registered along its chain, how the
 * item reads (lib/itemPresentation), and its links. Links come from the
 * URL templates the definition names; a definition with none falls back to
 * the registered renderer's.
 */
export function useItemView(item: { kind: number; tags: string[][] }): ItemView {
  const concept = useItemConcept(item);
  return useResolvedItemView(item, concept.data ?? null, concept.isPending);
}

/**
 * The same view, for a caller that already holds the item's resolved
 * definition — a Dictionary entry drawing its own items — so it needn't look
 * the concept up again per item (and an item filed under a copy, which
 * useItemConcept can't recognise by its `z` yet, still renders).
 */
export function useResolvedItemView(
  item: { tags: string[][] },
  resolved: ResolvedConcept | null,
  pending = false,
): ItemView {
  const refs = DISPLAY_HINTS_ENABLED && resolved ? resolved.governing.links : [];
  const templates = useLinkTemplates(refs);
  if (pending || !resolved) {
    return {
      pending,
      resolved: null,
      renderer: null,
      shown: null,
      links: [],
      usedFields: new Set(),
    };
  }
  const renderer = rendererFor(resolved);
  const valueOf = (name: string) => {
    const decl = resolved.governing.fields.find((f) => f.name === name);
    return decl ? fieldCell(item, decl).value : null;
  };
  const links: ViewLink[] = refs.length
    ? itemLinks(item, refs, templates.data ?? new Map()).map((l) => ({ ...l, source: "template" }))
    : (renderer?.links?.(valueOf) ?? []).map((l) => ({ ...l, host: new URL(l.href).host, source: "renderer" }));
  const shown = presentItem(item, resolved.governing, renderer);
  const usedFields = new Set(
    [
      shown.titleField,
      shown.summaryField,
      shown.imageField,
      // The link's fields: the templates' bindings, else what the fallback renderer reads.
      ...(refs.length ? refs.flatMap((r) => r.bindings.map(([, field]) => field)) : (renderer?.linkFields ?? [])),
    ].filter((f): f is string => !!f),
  );
  return { pending: false, resolved, renderer, shown, links, usedFields };
}
