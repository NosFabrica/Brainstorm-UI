/**
 * Search that names a list: "github vcavallo" is vcavallo among GitHub
 * Accounts. Every list the Dictionary shows can be named (the team,
 * 2026-10-10: no per-list switch, which no curator would know to set), and
 * everything else is the list's own governing definition (ADR 0004): the
 * words that name it are its singular and plural, less filler ("and", "of",
 * a bare number), so "salt and pepper" doesn't name Food and Drink Places;
 * what the rest are matched against is whatever it shows as an item's title
 * and summary (lib/itemPresentation). No list has a trigger word or a match
 * field of its own here.
 *
 * A stopgap, client-side and over the items the Dictionary reads: ADR 0004
 * puts this in the search API, which would return list items with their
 * definition attached.
 */
import { presentItem } from "@/lib/itemPresentation";
import type { ConceptDefinition } from "@/lib/conceptResolution";

export interface NamedList {
  coordinate: string;
  singular: string;
  plural: string;
}

export interface ListQuery {
  coordinate: string;
  /** The words left once the list's name is taken out, lowercased. */
  words: string[];
}

const wordsOf = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/** Words in a list's name that don't name it: joining words, articles, and bare numbers. */
const FILLER = new Set(["a", "an", "and", "&", "the", "of", "in", "on", "at", "to", "for", "from", "by", "with", "or"]);
const namesWords = (text: string) => wordsOf(text).filter((w) => !FILLER.has(w) && !/^\d+$/.test(w));

/**
 * The words of a search to find in one list's items: all of them but the
 * filler and the words of the list's own name — "books herbert" is
 * "herbert" among Books. Empty when nothing is left to find.
 */
export function wordsToFind(query: string, list: Pick<NamedList, "singular" | "plural">): string[] {
  const name = new Set([...namesWords(list.singular), ...namesWords(list.plural)]);
  return wordsOf(query).filter((w) => !FILLER.has(w) && !name.has(w));
}

/**
 * The list a search names and the words to find in it — the first list, in
 * the order given, with a word of its name among the search's. Null when no
 * list is named, or its name is all there is.
 */
export function listQueryOf(query: string, lists: readonly NamedList[]): ListQuery | null {
  const asked = wordsOf(query);
  for (const list of lists) {
    const name = new Set([...namesWords(list.singular), ...namesWords(list.plural)]);
    if (!asked.some((w) => name.has(w))) continue;
    const words = asked.filter((w) => !name.has(w));
    if (words.length) return { coordinate: list.coordinate, words };
  }
  return null;
}

/**
 * The items every word is found in, best first: a title that starts with
 * the words, then a title holding them, then the summary. Ties keep the
 * order given. `read` is how the cards read an item — by default the
 * definition's hints; a view that draws the item its own way (a book's title
 * and author from its own tags) passes its reading, so the words are matched
 * against what the card shows.
 */
export function matchListItems<T extends { tags: string[][] }>(
  items: readonly T[],
  definition: ConceptDefinition,
  words: readonly string[],
  max = 3,
  read: (item: T) => { title?: string | null; summary?: string | null } = (item) => presentItem(item, definition),
): T[] {
  if (!words.length) return [];
  const ranked: { item: T; rank: number }[] = [];
  for (const item of items) {
    const shown = read(item);
    const title = (shown.title ?? "").toLowerCase();
    const both = `${title} ${(shown.summary ?? "").toLowerCase()}`;
    if (!words.every((w) => both.includes(w))) continue;
    const inTitle = words.every((w) => title.includes(w));
    ranked.push({ item, rank: title.startsWith(words.join(" ")) ? 0 : inTitle ? 1 : 2 });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((r) => r.item);
}
