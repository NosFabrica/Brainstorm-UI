/** Articles and Recipes: the kinds of article among the hits, and the recipes' own topics. */
import type { NostrEvent } from "nostr-tools";
import type { SearchHit } from "@/services/search";
import { RECIPE_TAGS } from "@/lib/sourceApp";
import { PUBLICATION_KINDS } from "@/lib/publication";
import { countFacets, type Facet } from "./types";

/** What kind of article a hit is — the Articles tab's type chips narrow by this. */
export type ArticleType = "article" | "spec" | "wiki" | "publication";
export const ARTICLE_TYPE_LABEL: Record<ArticleType, string> = {
  article: "Articles",
  spec: "Specs",
  wiki: "Wiki",
  publication: "Publications",
};
export function articleTypeOf(kind: number): ArticleType {
  // A book, its chapters and the shelves that hold them read as one kind of thing.
  return kind === 30817 ? "spec" : kind === 30818 ? "wiki" : PUBLICATION_KINDS.has(kind) ? "publication" : "article";
}

/**
 * The kinds of article among the hits, in a fixed order. Chips only when
 * there is more than one kind to tell apart — a search for honey sees none
 * (the team: surface a way to narrow to specs only when specs were matched).
 */
export function articleFacets(hits: readonly SearchHit[]): ArticleType[] {
  const present = new Set(hits.map((h) => articleTypeOf(h.event.kind)));
  const types = (["article", "publication", "spec", "wiki"] as ArticleType[]).filter((t) => present.has(t));
  return types.length > 1 ? types : [];
}

/**
 * A recipe's topics. zap.cooking writes each chosen category twice — plain
 * and as `zapcooking-<word>` — beside the recipe marker itself and a
 * `zapcooking-<slug>` copy of the dish (the `d` tag). The words are topics
 * whichever way they are spelled; the marker and the dish's slug are not, and
 * neither is a bare number, which is a serving count or a step.
 */
export function recipeTopics(e: NostrEvent): string[] {
  const marker = new RegExp(`^(${RECIPE_TAGS.join("|")})(-|$)`, "i");
  const slug = (e.tags.find((t) => t[0] === "d")?.[1] ?? "").trim().toLowerCase();
  const words = e.tags
    .filter((t) => t[0] === "t" && t[1])
    .map((t) => t[1].trim().replace(/^#/, "").toLowerCase())
    .map((t) => (marker.test(t) ? t.replace(marker, "") : t))
    .filter((t) => t && t !== slug && !/^\d+$/.test(t));
  return [...new Set(words)];
}

/**
 * The recipes' own topics — chicken, soup — counted. zap.cooking's
 * housekeeping tags (the recipe marker and its `zapcooking-<slug>` copies)
 * name the app and the dish, not a topic, and stay out.
 */
export function recipeFacets(hits: readonly SearchHit[]): Facet[] {
  return countFacets(hits, (h) => recipeTopics(h.event)).slice(0, 10);
}
