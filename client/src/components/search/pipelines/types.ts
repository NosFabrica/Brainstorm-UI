import type { SearchHit } from "@/services/search";
import type { ListGroupView } from "@/components/search/cards";

/** One row of the flat list: a hit, and — when it leads a fold — how many it
 *  hides, the chip's words, and (for an opened fork) whose fork it is. */
export type DisplayRow = {
  hit: SearchHit;
  collapsedCount: number;
  clusterId: string;
  chipLabel?: string;
  forkOf?: string;
  /** A folded same-title follow pack: how many lists, their union, the faces most agree on. */
  listGroup?: ListGroupView;
};

/** A facet chip's value and how many of the page's hits it holds. */
export type Facet<T = string> = [T, number];

/** Hits counted by the values `valuesOf` reads off each, most first (ties in the order first met). */
export function countFacets(hits: readonly SearchHit[], valuesOf: (hit: SearchHit) => Iterable<string>): Facet[] {
  const counts = new Map<string, number>();
  for (const h of hits) for (const v of valuesOf(h)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
