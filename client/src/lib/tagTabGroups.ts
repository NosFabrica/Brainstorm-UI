import { DLIST_ITEM_KINDS } from "@/lib/dlistFields";
import { kindLabel, type KindEvent } from "@/lib/kindLabel";
import { pluralLabel } from "@/lib/allCategories";

/** Which group a row of a tag's tab falls in, and how that group is named while its list's name is coming. */
export interface RowGroup {
  /** `person`, a Dictionary list's header coordinate, or `kind:<label>`. */
  key: string;
  /** Plural, as a chip names it: "People", "Notes"; a list's is its header's (`headerOf`). */
  name: string;
  /** A list item's list: its header's coordinate, to be named from the header. */
  header?: string;
}

const isItem = (kind: number) => (DLIST_ITEM_KINDS as readonly number[]).includes(kind);

/**
 * What a row is, for the chips that narrow a tag's tab: a person, an item of one Dictionary list
 * (by the list its `z` files it under — a GitHub account, a book), or any other kind by its name.
 */
export function groupOf(event: KindEvent): RowGroup {
  if (event.kind === 0) return { key: "person", name: "People" };
  if (isItem(event.kind)) {
    const header = event.tags.find((t) => t[0] === "z" && /^(39998|9998):[0-9a-f]{64}:/.test(t[1] ?? ""))?.[1];
    if (header) return { key: header, name: header.split(":").slice(2).join(":"), header };
  }
  const label = kindLabel(event);
  return { key: `kind:${label}`, name: pluralLabel(label) };
}
