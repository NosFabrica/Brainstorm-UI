/**
 * An item on a list, as a form's values and as the event it becomes (List
 * Management's item form). A kind-39999 filed under the list by `z` — the
 * list's own coordinate (a 9998's id), whichever definition the author
 * previewed it under —
 * carrying a tag per field that has a value: the fields the list declares
 * first, in its order, then any others the author filled in (for a copy's
 * fields, say), which a reader shows apart from the list's own.
 *
 * Its `d` is a slug of its title with a random tail: an item's address is its
 * author and `d` alone, not its list, so a `d` reused on another list would
 * replace that item.
 */
import type { EventTemplate } from "@/lib/conceptCopy";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { headerReference } from "@/lib/dlistFields";
import { slugOf } from "@/lib/listDraft";

export type ItemValues = Record<string, string>;

/** Eight hex characters, the random tail of an item's `d`. */
export function randomTail(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The field an item is titled by under a definition: its title hint, else its first required field. */
export function titleFieldOf(def: ConceptDefinition): string | null {
  return def.display.title ?? def.fields.find((f) => f.requirement === "required")?.name ?? def.fields[0]?.name ?? null;
}

export function itemD(title: string | null | undefined, tail: string): string {
  const slug = slugOf(title ?? "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return slug ? `${slug}-${tail}` : `item-${tail}`;
}

/**
 * The item as an unsigned event. `list` is the list's own definition: its
 * fields come first and it names the item's kind in `alt`.
 */
export function itemTemplate(list: ConceptDefinition, values: ItemValues, tail: string): EventTemplate {
  const filled = (name: string) => values[name]?.trim() || null;
  const declared = list.fields.map((f) => f.name);
  const others = Object.keys(values).filter((name) => !declared.includes(name) && filled(name));
  const title = filled(titleFieldOf(list) ?? "");
  const tags: string[][] = [
    ["d", itemD(title, tail)],
    // A 9998 is named by its id even when it carries a `d`: its coordinate names no list.
    ["z", headerReference(list.event) ?? list.coordinate],
    ...[...declared, ...others].flatMap((name) => (filled(name) ? [[name, filled(name)!]] : [])),
  ];
  if (title) tags.push(["alt", `${list.singular}: ${title}`]);
  return { kind: 39999, content: "", tags };
}

/** What stops the item from publishing: a field the list itself requires, left empty. */
export function itemProblems(list: ConceptDefinition, values: ItemValues): string[] {
  const missing = list.fields.filter((f) => f.requirement === "required" && !values[f.name]?.trim());
  return missing.length ? [`${list.plural} require ${missing.map((f) => f.name).join(", ")}.`] : [];
}
