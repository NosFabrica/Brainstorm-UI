/**
 * All's categories (hooks/useAllCategories): the kinds its results are, each named as the rows'
 * badges name them (lib/kindLabel) in the plural — the four video kinds are one Videos, a
 * zap.cooking article a Recipe — and the Dictionary's lists the words find items on
 * (hooks/useListRibbon). Each is a question the relay can be asked on its own: kinds, and a
 * list's `#z`. They stand in the tab row, most results first.
 */
import { DLIST_ITEM_KINDS } from "@/lib/dlistFields";
import { kindLabel, kindTypeLabel } from "@/lib/kindLabel";
import type { CategoryAsk, SearchHit } from "@/services/search";

export interface Category extends CategoryAsk {
  /** Its key in the row and in the link: a list's coordinate, or `kind:` and the rows' label. */
  key: string;
  /** What the row calls it: "Videos", "Food and Drink Places". */
  name: string;
  /** A kind's rows' label ("Video"): its page keeps only the rows so labelled. None for a list. */
  label?: string;
}

const KIND_KEY = "kind:";
export const isKindKey = (key: string) => key.startsWith(KIND_KEY);

/** The highest kind NIP-01 allows. */
const MAX_KIND = 65535;
let byLabel: Map<string, number[]> | null = null;
/** Every kind lib/kindLabel calls `label` by its number alone. */
export function kindsLabelled(label: string): number[] {
  if (!byLabel) {
    byLabel = new Map();
    for (let kind = 0; kind <= MAX_KIND; kind++) {
      const named = kindTypeLabel(kind);
      if (named === `Kind ${kind}`) continue;
      const kinds = byLabel.get(named);
      if (kinds) kinds.push(kind);
      else byLabel.set(named, [kind]);
    }
  }
  return byLabel.get(label) ?? [];
}

/**
 * A category per label among `hits`, past the rows `held` (a list item a list holds is its
 * list's, not one more kind). Its kinds are every kind of that name and those its rows are — a
 * Recipe is an article's kind with zap.cooking's word.
 */
export function kindCategories(hits: readonly SearchHit[], held: ReadonlySet<string> = new Set()): Category[] {
  const found = new Map<string, Set<number>>();
  for (const hit of hits) {
    if (held.has(hit.event.id)) continue;
    const label = kindLabel(hit.event);
    const kinds = found.get(label) ?? new Set(kindsLabelled(label));
    kinds.add(hit.event.kind);
    found.set(label, kinds);
  }
  return [...found].map(([label, kinds]) => ({
    key: KIND_KEY + label,
    name: pluralLabel(label),
    label,
    kinds: [...kinds].sort((a, b) => a - b),
  }));
}

/** A Dictionary list as a category: its items, by the headers they are filed under. */
export function listCategory(list: { coordinate: string; name: string; headers: readonly string[] }): Category {
  return { key: list.coordinate, name: list.name, kinds: [...DLIST_ITEM_KINDS], tags: { "#z": [...list.headers] } };
}

/** Whether a row belongs on a category's page: a kind's keeps only the rows its label names. */
export const belongsTo = (category: Category, hit: SearchHit) =>
  !category.label || kindLabel(hit.event) === category.label;

/** Most results first; a count not known after them; then by name. */
export function byResults(categories: readonly Category[], counts: ReadonlyMap<string, number | null>): Category[] {
  const n = (c: Category) => counts.get(c.key) ?? -1;
  return [...categories].sort(
    (a, b) => n(b) - n(a) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** Labels that are already plural, or have no plural to speak of. */
const PLURALS: Readonly<Record<string, string>> = {
  Person: "People",
  Audio: "Audio",
  Code: "Code",
  "App data": "App data",
  "Encrypted DM": "Encrypted DMs",
  "DM relays": "DM relays",
  "Wallet info": "Wallet info",
  "Profile badges": "Profile badges",
  Mostro: "Mostro orders",
  Bookshelf: "Bookshelves",
  Canvas: "Canvases",
  Feedback: "Feedback",
  "Job progress": "Job progress",
  "Trusted people": "Trusted people",
};

/**
 * "Web bookmark" → "Web bookmarks", "Patch" → "Patches". Already plural ("Search relays"),
 * an event that happened ("Job accepted") or a kind with no name ("Kind 30405"): as it is.
 */
export function pluralLabel(label: string): string {
  if (PLURALS[label]) return PLURALS[label];
  if (/^Kind \d+$/.test(label) || /[^aeiou]ed$/.test(label)) return label;
  if (/[^aeiou]y$/.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(ss|us|x|z|ch|sh)$/.test(label)) return `${label}es`;
  if (/s$/.test(label)) return label;
  return `${label}s`;
}

/** A test id for a category: a kind's label, or a list's `d`. */
export function categoryTestId(key: string): string {
  const id = isKindKey(key) ? key.slice(KIND_KEY.length) : key.split(":").slice(2).join(":") || key;
  return id.toLowerCase().replace(/\s+/g, "-");
}

/** What a category's page says it holds so far: "1 Video", "40 Food and Drink Places". */
export function pagedWords(category: Category, n: number): string {
  return `${n} ${n === 1 && category.label ? category.label : category.name}`;
}
