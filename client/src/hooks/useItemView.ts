import { useItemConcept } from "@/hooks/useItemConcept";
import { useLinkTemplates } from "@/hooks/useLinkTemplates";
import { presentItem, type ItemPresentation } from "@/lib/itemPresentation";
import { itemLinks, type ItemLink } from "@/lib/linkTemplates";
import type { ResolvedConcept } from "@/lib/conceptResolution";

export interface ItemView {
  pending: boolean;
  /** Null once settled: no definition could be read. */
  resolved: ResolvedConcept | null;
  shown: ItemPresentation | null;
  /** Built from the URL templates the definition names — and nothing else. */
  links: ItemLink[];
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
 * Everything a list item's renderers draw from — the page, the results card,
 * the search popup row, the list row — so none can disagree: the governing
 * definition (ADR 0004), how the item reads (lib/itemPresentation), and the
 * links its URL templates build. All of it data: no concept has code of its
 * own (the team, 2026-10-02), so an item whose definition names no template
 * has no link until one does.
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
  const refs = resolved ? resolved.governing.links : [];
  const templates = useLinkTemplates(refs);
  if (pending || !resolved) return { pending, resolved: null, shown: null, links: [], usedFields: new Set() };
  const shown = presentItem(item, resolved.governing);
  // The item's own link (a `link` role) first, then the ones its templates build; one per address.
  const links = [...(shown.link ? [shown.link] : []), ...itemLinks(item, refs, templates.data ?? new Map())].filter(
    (l, i, all) => all.findIndex((x) => x.href === l.href) === i,
  );
  const usedFields = new Set(
    [
      shown.titleField,
      shown.summaryField,
      shown.imageField,
      shown.linkField,
      shown.mediaField,
      shown.locationField,
      ...shown.factFields,
      ...refs.flatMap((r) => r.bindings.map(([, field]) => field)),
    ].filter((f): f is string => !!f),
  );
  return { pending: false, resolved, shown, links, usedFields };
}
