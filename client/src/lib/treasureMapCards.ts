/**
 * A Treasure Map (the reader's kind 10040) read by category, as Settings ›
 * Treasure Map shows it: which Assistants it asks for Scores, for Lists, for
 * Concepts, and the entries behind each. Pure.
 *
 * Ported from Tapestry's Manage your Treasure Map page
 * (ui/src/pages/treasure-map/manageTreasureMap.js and editTreasureMap.js's
 * `roleOf`; ADRs manage-treasure-map/0002, treasure-map-edit/0001–0002), so
 * the two apps read one Map the same way. It reads keys by the draft Treasure
 * Maps grammar (nous-clawds4/tapestry protocols/drafts/treasure-maps.md):
 * `<kind slot>[:<segment>…]`, the slot a kind (`30382`), a family (`3038x`,
 * `3039x`) or everything (`*`). lib/treasureMap reads the same Map as duties.
 */

export type MapCategory = "scores" | "lists" | "concepts";
export const CATEGORIES: readonly MapCategory[] = ["scores", "lists", "concepts"];

const HEX64 = /^[0-9a-f]{64}$/i;
const KIND = /^\d{5}$/;

/** One Map tag as the cards read it. */
export interface MapEntry {
  key: string;
  /** The kind slot: the key up to its first colon. */
  slot: string;
  rest: string;
  concept: boolean;
  /** The key's segments after the slot, empty ones at the end dropped; none for a Concept key. */
  segments: string[];
  /** What it's grouped and compared by: `39998:dlist-header` is `39998`, `*:` is `*`, `3038x:tag:` is `3038x:tag`. */
  norm: string;
  /** The delegate, lowercased. */
  pubkey: string;
}

/**
 * One tag, parsed; null when it can't count (no string key, or no valid 64-hex
 * delegate). A Concept key (`39998`, `39999`) keeps its `d` whole.
 */
export function entryOf(tag: unknown): MapEntry | null {
  if (!Array.isArray(tag) || typeof tag[0] !== "string" || typeof tag[1] !== "string" || !HEX64.test(tag[1])) {
    return null;
  }
  const key = tag[0];
  const colon = key.indexOf(":");
  const slot = colon < 0 ? key : key.slice(0, colon);
  const rest = colon < 0 ? "" : key.slice(colon + 1);
  const concept = slot === "39998" || slot === "39999";
  let segments: string[] = [];
  let norm: string;
  if (concept) {
    norm = slot === "39998" && rest === "dlist-header" ? "39998" : key;
  } else {
    segments = rest === "" ? [] : rest.split(":");
    while (segments.length > 0 && segments[segments.length - 1] === "") segments.pop();
    norm = [slot, ...segments].join(":");
  }
  return { key, slot, rest, concept, segments, norm, pubkey: tag[1].toLowerCase() };
}

/**
 * Does this entry apply to the category: its own kinds, its family, or
 * everything. A bare `*` (`*:`, `*::` too) reaches all three; a `*:…` naming
 * anything after the `*` reaches none — not supported for now (Tapestry's
 * book decision 11).
 */
export function appliesTo(category: MapCategory, { slot, segments }: Pick<MapEntry, "slot" | "segments">): boolean {
  if (KIND.test(slot)) {
    const kind = Number(slot);
    if (category === "scores") return kind >= 30380 && kind <= 30389;
    if (category === "lists") return kind >= 30390 && kind <= 30399;
    return kind === 39998 || kind === 39999;
  }
  if (slot === "3038x") return category === "scores";
  if (slot === "3039x") return category === "lists";
  return slot === "*" && segments.length === 0;
}

/** A bare `*` that a family entry covers completely for the category — so nothing there reaches it. */
function shadowed(category: MapCategory, entry: MapEntry, norms: ReadonlySet<string>): boolean {
  if (entry.norm !== "*") return false;
  return norms.has(category === "scores" ? "3038x" : category === "lists" ? "3039x" : "39998");
}

export interface CategoryEntry {
  /** The key as the Map first spells it. */
  key: string;
  norm: string;
  /** Every tag for the key with a valid delegate, in Map order: the first is its Preferred Assistant, the rest backups. */
  tags: { pubkey: string; relay: string }[];
}

export type ByCategory<T> = Record<MapCategory, T>;

/**
 * The entries behind each card: per category, each key that counts, in the
 * order the Map first names it. A card and its details panel are both drawn
 * from this one walk, so they can't disagree. Never throws.
 */
export function categoryEntries(event: { tags?: unknown } | null | undefined): ByCategory<CategoryEntry[]> {
  const tags = Array.isArray(event?.tags) ? (event.tags as unknown[]) : [];
  const found: { entry: MapEntry; relay: string }[] = [];
  for (const tag of tags) {
    const entry = entryOf(tag);
    if (entry) found.push({ entry, relay: typeof (tag as unknown[])[2] === "string" ? (tag as string[])[2] : "" });
  }
  const norms = new Set(found.map(({ entry }) => entry.norm));
  const out: ByCategory<CategoryEntry[]> = { scores: [], lists: [], concepts: [] };
  for (const category of CATEGORIES) {
    const byNorm = new Map<string, CategoryEntry>();
    for (const { entry, relay } of found) {
      if (!appliesTo(category, entry) || shadowed(category, entry, norms)) continue;
      let group = byNorm.get(entry.norm);
      if (!group) {
        group = { key: entry.key, norm: entry.norm, tags: [] };
        byNorm.set(entry.norm, group);
        out[category].push(group);
      }
      group.tags.push({ pubkey: entry.pubkey, relay });
    }
  }
  return out;
}

/**
 * Which Assistants the Map asks for each category: each key's first valid
 * delegate (later ones are backups), in the order the Map first names them,
 * without repeats. Never throws.
 */
export function categoryAssistants(event: { tags?: unknown } | null | undefined): ByCategory<string[]> {
  const entries = categoryEntries(event);
  const out: ByCategory<string[]> = { scores: [], lists: [], concepts: [] };
  for (const category of CATEGORIES) {
    for (const { tags } of entries[category]) {
      if (!out[category].includes(tags[0].pubkey)) out[category].push(tags[0].pubkey);
    }
  }
  return out;
}

/** The system words a key may name after its kind: `tag`, `pin`, `dlist`, `contexts`. */
export const SYSTEM_WORDS: ReadonlySet<string> = new Set(["tag", "pin", "dlist", "contexts"]);

export type EntryRole = "own" | "individual";

/**
 * A parsed entry's role in a category. Own: a whole family, a whole kind, or
 * (Scores) one standard score, `<kind or 3038x>:<metric>`. Individual: the
 * category's narrower entries — a Tag, a Pin, a DList, `contexts`, a Concept's
 * own list. A `*` entry, an invalid one or another category's has none.
 */
export function roleOf(category: MapCategory, entry: MapEntry | null): EntryRole | null {
  if (!entry || entry.slot === "*" || !appliesTo(category, entry)) return null;
  if (category === "concepts") return entry.norm === "39998" || entry.norm === "39999" ? "own" : "individual";
  if (category === "lists") return entry.segments.length === 0 ? "own" : "individual";
  const { segments } = entry;
  return segments.length === 0 || (segments.length === 1 && !SYSTEM_WORDS.has(segments[0])) ? "own" : "individual";
}

/** A tag's role in a category: own, individually assigned, or none. */
export function entryRole(category: MapCategory, tag: unknown): EntryRole | null {
  return roleOf(category, entryOf(tag));
}
