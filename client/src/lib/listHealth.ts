/**
 * A list's health, read from its items' checks (lib/listCheck): how many
 * items have a title, a picture, a working link; which problems recur and
 * which stop an item publishing; and the search, filter and sort the items
 * table runs over the checked items. Reads no relay and draws nothing: a
 * caller passes in the items and the URL templates it already holds.
 *
 * Search is literal: each whitespace-separated word must appear in the
 * item's title, summary, `d`, or any value of a field the definition
 * declares, ignoring case and accents as the Dictionary's filter does
 * (lib/dictionaryItems). A word is never read as a pattern, so a "(" or
 * a "*" finds what it says.
 */
import type { NostrEvent } from "nostr-tools";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { fold } from "@/lib/dictionaryItems";
import type { UrlTemplate } from "@/lib/linkTemplates";
import { checkItemUnder, type ItemCheck, type Problem, type ProblemCode } from "@/lib/listCheck";

export interface CheckedItem {
  item: NostrEvent;
  check: ItemCheck;
}

export type Role = "title" | "summary" | "image" | "link" | "media" | "location" | "facts" | "templateLinks";

export const ROLE_LABEL: Record<Role, string> = {
  title: "Title",
  summary: "Summary",
  image: "Picture",
  link: "Own link",
  media: "Playable media",
  location: "Location",
  facts: "Facts",
  templateLinks: "Template links",
};

export interface ProblemRow {
  key: string;
  code: ProblemCode;
  field: string | null;
  /** How many items have it, not how many times it occurs. */
  items: number;
  /** The form won't publish an item with it. */
  blocking: boolean;
  /** The first message seen for it. */
  example: string;
}

export interface ListSummary {
  items: number;
  curators: number;
  withProblems: number;
  blocked: number;
  coverage: { role: Role; count: number }[];
  problems: ProblemRow[];
}

export interface ItemQuery {
  text: string;
  curator: string | null;
  /** A `problemKey`. */
  problem: string | null;
  onlyProblems: boolean;
}

export const EMPTY_QUERY: ItemQuery = { text: "", curator: null, problem: null, onlyProblems: false };

export type ItemSort = "newest" | "title" | "problems";

/** "code:field", or "code" for a problem about no one field. */
export const problemKey = (p: { code: string; field: string | null }) => (p.field ? `${p.code}:${p.field}` : p.code);

export function checkList(
  def: ConceptDefinition,
  items: readonly NostrEvent[],
  templates: ReadonlyMap<string, UrlTemplate>,
): CheckedItem[] {
  return items.map((item) => ({ item, check: checkItemUnder(def, item.tags, templates) }));
}

const titleOf = (c: CheckedItem) => c.check.resolved.title?.trim() || null;

/** The roles a list can show, given its definition and what its first item resolved. */
function rolesOf(def: ConceptDefinition, first: CheckedItem): Role[] {
  const r = first.check.resolved;
  const roles: Role[] = ["title"];
  if (r.summaryField != null) roles.push("summary");
  if (r.imageField != null) roles.push("image");
  if (r.linkField != null) roles.push("link");
  if (r.mediaField != null) roles.push("media");
  if (r.locationField != null) roles.push("location");
  if (def.display.facts.length > 0) roles.push("facts");
  if (def.links.length > 0) roles.push("templateLinks");
  return roles;
}

const has = (c: CheckedItem, role: Role): boolean => {
  const r = c.check.resolved;
  switch (role) {
    case "title":
      return titleOf(c) != null;
    case "summary":
      return !!r.summary?.trim();
    case "image":
      return r.image != null;
    case "link":
      return r.link != null;
    case "media":
      return r.media != null;
    case "location":
      return r.location != null;
    case "facts":
      return r.facts.length > 0;
    case "templateLinks":
      return r.links.every((l) => l.href != null);
  }
};

export function summarize(def: ConceptDefinition, checked: readonly CheckedItem[]): ListSummary {
  const rows = new Map<string, ProblemRow>();
  for (const { check } of checked) {
    const seen = new Set<string>();
    for (const p of check.problems) {
      const key = problemKey(p);
      const row = rows.get(key);
      if (!row)
        rows.set(key, { key, code: p.code, field: p.field, items: 0, blocking: p.blocking, example: p.message });
      else if (p.blocking) row.blocking = true;
      if (!seen.has(key)) {
        seen.add(key);
        rows.get(key)!.items++;
      }
    }
  }
  return {
    items: checked.length,
    curators: new Set(checked.map((c) => c.item.pubkey)).size,
    withProblems: checked.filter((c) => c.check.problems.length > 0).length,
    blocked: checked.filter((c) => c.check.problems.some((p: Problem) => p.blocking)).length,
    coverage:
      checked.length === 0
        ? []
        : rolesOf(def, checked[0]).map((role) => ({ role, count: checked.filter((c) => has(c, role)).length })),
    problems: [...rows.values()].sort((a, b) => b.items - a.items || a.key.localeCompare(b.key)),
  };
}

/** What a search reads of an item, folded: what shows, its `d`, and every value of every `declared` field. */
function searchText(declared: ReadonlySet<string>, c: CheckedItem): string {
  const { title, summary } = c.check.resolved;
  const d = c.item.tags.find((t) => t[0] === "d")?.[1];
  const values = c.item.tags.filter((t) => declared.has(t[0])).map((t) => t[1]);
  return fold([title, summary, d, ...values].filter(Boolean).join(" "));
}

export function filterItems(def: ConceptDefinition, checked: readonly CheckedItem[], query: ItemQuery): CheckedItem[] {
  const words = fold(query.text).split(/\s+/).filter(Boolean);
  // Once a search, not once an item: a list is thousands of items and this runs on every keystroke.
  const declared = new Set(def.fields.map((f) => f.name));
  return checked.filter((c) => {
    if (query.curator != null && c.item.pubkey !== query.curator) return false;
    if (query.problem != null && !c.check.problems.some((p) => problemKey(p) === query.problem)) return false;
    if (query.onlyProblems && c.check.problems.length === 0) return false;
    if (words.length === 0) return true;
    const text = searchText(declared, c);
    return words.every((w) => text.includes(w));
  });
}

/** Titles in the reader's alphabet, case and accents aside. One collator: a sort compares thousands of times. */
const byTitle = new Intl.Collator(undefined, { sensitivity: "base" });

const newest = (a: CheckedItem, b: CheckedItem) =>
  b.item.created_at - a.item.created_at || a.item.id.localeCompare(b.item.id);

export function sortItems(checked: readonly CheckedItem[], sort: ItemSort): CheckedItem[] {
  const sorted = [...checked];
  if (sort === "newest") return sorted.sort(newest);
  if (sort === "problems")
    return sorted.sort((a, b) => b.check.problems.length - a.check.problems.length || newest(a, b));
  return sorted.sort((a, b) => {
    const ta = titleOf(a);
    const tb = titleOf(b);
    if (ta == null || tb == null) return ta == null && tb == null ? newest(a, b) : ta == null ? 1 : -1;
    return byTitle.compare(ta, tb) || newest(a, b);
  });
}
