/**
 * A list item among the rest of its list: who else listed the same thing,
 * and what else the list holds. "The same thing" is the same value in the
 * definition's first required field, whatever the case — what the list says
 * every item must carry is what tells its items apart, where a title may be
 * a field some items lack. Two people filing `vitorpamplona` under GitHub
 * Accounts listed one account. A definition that requires nothing falls back
 * to the title (lib/itemPresentation). Nothing here knows any list by name
 * (ADR 0004).
 */
import { fieldCell } from "@/lib/dlistFields";
import { presentItem } from "@/lib/itemPresentation";
import type { ConceptDefinition } from "@/lib/conceptResolution";

export interface ItemNeighbours<T> {
  /** The other authors who listed the same thing, in the order given. */
  alsoListedBy: string[];
  /** The list's other things, one item for each, in the order given. */
  more: T[];
  /** How many distinct things the list holds, this one included. */
  total: number;
}

export function neighboursOf<T extends { id: string; pubkey: string; tags: string[][] }>(
  item: { id: string; pubkey: string; tags: string[][] },
  items: readonly T[],
  definition: ConceptDefinition,
  max = 3,
): ItemNeighbours<T> {
  const required = definition.fields.find((f) => f.requirement === "required");
  const keyOf = (i: { tags: string[][] }) =>
    (required ? fieldCell(i, required).value : presentItem(i, definition).title)?.trim().toLowerCase() || null;
  const own = keyOf(item);
  const alsoListedBy: string[] = [];
  const others = new Map<string, T>();
  for (const other of items) {
    const key = keyOf(other);
    if (!key) continue;
    if (key !== own) {
      if (!others.has(key)) others.set(key, other);
    } else if (other.pubkey !== item.pubkey && !alsoListedBy.includes(other.pubkey)) {
      alsoListedBy.push(other.pubkey);
    }
  }
  return { alsoListedBy, more: [...others.values()].slice(0, max), total: others.size + (own ? 1 : 0) };
}
