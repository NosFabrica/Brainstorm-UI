/** The Apps tab: what the results run on, and their own categories, as one row of chips. */
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { platformWords } from "@/components/search/cards";
import { countFacets, type Facet } from "./types";

/** The platforms the page's apps run on, counted — Benjamin's "categorize by the chips". */
export function appPlatformFacets(hits: readonly SearchHit[]): Facet[] {
  return countFacets(hits, (h) => platformWords(h.event));
}

/**
 * A listing's t-tags as categories. A tag that merely restates a platform
 * word ("android") never doubles as a category.
 */
export function appCategoryTags(e: NostrEvent): string[] {
  const platformSet = new Set(platformWords(e).map((w) => w.toLowerCase()));
  return [...new Set(e.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1].toLowerCase()))].filter(
    (t) => !platformSet.has(t),
  );
}

/** The page's app categories, counted. */
export function appCategoryFacets(hits: readonly SearchHit[]): Facet[] {
  return countFacets(hits, (h) => appCategoryTags(h.event)).slice(0, 10);
}

/** The Apps tab's rows, narrowed by platform and category. */
export function appRows(shown: SearchHit[], s: { platform: string | null; category: string | null }): SearchHit[] {
  const { platform, category } = s;
  if (platform) shown = shown.filter((h) => platformWords(h.event).includes(platform));
  if (category) shown = shown.filter((h) => appCategoryTags(h.event).includes(category));
  return shown;
}
