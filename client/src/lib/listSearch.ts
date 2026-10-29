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
 * Whether a search is a list's name and nothing more — "books", "food
 * places": it asks for the list itself, not for items in it.
 */
export function namesListOnly(query: string, list: Pick<NamedList, "singular" | "plural">): boolean {
  const asked = wordsOf(query).filter((w) => !FILLER.has(w));
  return asked.length > 0 && wordsToFind(query, list).length === 0;
}

/**
 * Whether the words are most of a title — more than half of its words, filler
 * aside — and so a search for that very thing: "dune" for Dune, "hornblower
 * in the west" for Hornblower in the West Indies. A word it only shares
 * ("west" in West from Home) is not. `typing`: the last word may be a word's
 * beginning, as it is in the dropdown.
 */
export function coversTitle(words: readonly string[], title: string, typing = false): boolean {
  const titleWords = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w));
  if (titleWords.length === 0) return false;
  const last = typing ? words[words.length - 1] : undefined;
  const matched = titleWords.filter((w) => words.includes(w) || (!!last && w.startsWith(last))).length;
  return matched * 2 > titleWords.length;
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

/** A text's words, lowercased: letters and digits, whatever the script. */
const tokensOf = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * The items every word is found in, best first: a title that starts with
 * the words, then a title holding them, then the rest of what the card
 * shows. Ties keep the order given.
 *
 * A word is a whole word: "west" is West Roxbury, not Westlake. While the
 * words are still being typed (`typing`), the last may be the start of one.
 * `titleOnly` matches by what a thing is called alone — the Top page's
 * reading, where a book is found by its title, not by its author's name.
 *
 * `read` is how the cards read an item — by default the definition's hints;
 * a view that draws the item its own way (a book's title and author from
 * its own tags) passes its reading, so the words are matched against what
 * the card shows.
 */
export function matchListItems<T extends { tags: string[][] }>(
  items: readonly T[],
  definition: ConceptDefinition,
  words: readonly string[],
  max = 3,
  read: (item: T) => { title?: string | null; summary?: string | null } = (item) => presentItem(item, definition),
  { typing = false, titleOnly = false }: { typing?: boolean; titleOnly?: boolean } = {},
): T[] {
  if (!words.length) return [];
  const last = words.length - 1;
  const found = (tokens: string[]) =>
    words.every((w, i) => tokens.some((t) => (typing && i === last ? t.startsWith(w) : t === w)));
  const ranked: { item: T; rank: number }[] = [];
  for (const item of items) {
    const shown = read(item);
    const title = shown.title ?? "";
    const inTitle = found(tokensOf(title));
    if (!inTitle && (titleOnly || !found(tokensOf(`${title} ${shown.summary ?? ""}`)))) continue;
    ranked.push({ item, rank: title.toLowerCase().startsWith(words.join(" ")) ? 0 : inTitle ? 1 : 2 });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((r) => r.item);
}
