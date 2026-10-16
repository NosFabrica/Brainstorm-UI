/**
 * Finding one item among hundreds on a Dictionary entry (DictionaryTab's
 * items section). The filter reads what the row shows — the title and the
 * summary line, as presentItem draws them from the governing definition —
 * so an item is found by the words a reader can see, never by a hidden
 * field. Words match in any order, ignoring case and accents. The sort is
 * by that same title, or by when the item was listed.
 */
import { presentItem } from "./itemPresentation";
import type { ConceptDefinition } from "./conceptResolution";

type Item = { created_at: number; tags: string[][] };

export type ItemOrder = "newest" | "oldest" | "name";

export const ITEM_ORDERS: { key: ItemOrder; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "name", label: "A to Z" },
];

/** Lower-cased, accents removed: what a search compares. */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const shownText = (item: Item, definition: ConceptDefinition) => {
  const { title, summary } = presentItem(item, definition);
  return fold([title, summary].filter(Boolean).join(" "));
};

export function filterItems<T extends Item>(items: T[], definition: ConceptDefinition, query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const text = shownText(item, definition);
    return words.every((w) => text.includes(w));
  });
}

export function sortItems<T extends Item>(items: T[], definition: ConceptDefinition, order: ItemOrder): T[] {
  const sorted = [...items];
  if (order === "name") {
    const titles = new Map(sorted.map((i) => [i, presentItem(i, definition).title ?? ""]));
    return sorted.sort((a, b) => titles.get(a)!.localeCompare(titles.get(b)!, undefined, { sensitivity: "base" }));
  }
  return sorted.sort((a, b) => (order === "newest" ? b.created_at - a.created_at : a.created_at - b.created_at));
}
