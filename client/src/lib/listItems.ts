/**
 * A NIP-51 list of things — bookmarks, a bookmark set, a curation set, pins,
 * interests — read as what it holds: the notes (`e`), the addressable things
 * (`a`: articles, videos, communities), the people (`p`), the hashtags (`t`)
 * and the links (`r`), each in the order the list keeps them. An `e` here is
 * an item, never a thread (noteRefs.isThreadedKind).
 *
 * Relay and server lists name relays in `r`: they are not read here.
 */
import { contentShape } from "@/lib/contentShape";
import { kindTypeLabel } from "@/lib/kindLabel";
import { addrCoord, type AddressRef } from "@/lib/noteRefs";

/**
 * The lists whose items are things to open: pins (10001), bookmarks (10003),
 * communities (10004), interests (10015), generic lists (30001), bookmark
 * sets (30003), curation sets of articles, videos and pictures
 * (30004–30006), interest sets (30015).
 */
export const ITEM_LIST_KINDS: ReadonlySet<number> = new Set([
  10001, 10003, 10004, 10015, 30001, 30003, 30004, 30005, 30006, 30015,
]);

const HEX64 = /^[0-9a-f]{64}$/i;

export interface ListNote {
  id: string;
  relay?: string;
}

export interface ListItems {
  notes: ListNote[];
  addresses: AddressRef[];
  people: string[];
  hashtags: string[];
  links: string[];
  /** Everything public, counted once. */
  total: number;
  /** The list also holds items sealed in its content, for its owner alone. */
  sealed: boolean;
}

function relayOf(t: string[]): string | undefined {
  return typeof t[2] === "string" && /^wss?:\/\//i.test(t[2]) ? t[2] : undefined;
}

function addressOf(t: string[]): AddressRef | null {
  const parts = (t[1] ?? "").split(":");
  if (parts.length < 3) return null;
  const kind = Number(parts[0]);
  if (!Number.isInteger(kind) || !HEX64.test(parts[1])) return null;
  const relay = relayOf(t);
  return {
    kind,
    pubkey: parts[1].toLowerCase(),
    identifier: parts.slice(2).join(":"),
    relays: relay ? [relay] : undefined,
  };
}

export function readListItems(ev: { tags: string[][]; content: string }): ListItems {
  const notes = new Map<string, ListNote>();
  const addresses = new Map<string, AddressRef>();
  const people = new Set<string>();
  const hashtags = new Set<string>();
  const links = new Set<string>();
  for (const t of ev.tags) {
    const v = t[1];
    if (!v) continue;
    if (t[0] === "e" && HEX64.test(v)) {
      const id = v.toLowerCase();
      if (!notes.has(id)) notes.set(id, { id, relay: relayOf(t) });
    } else if (t[0] === "a") {
      const a = addressOf(t);
      if (a && !addresses.has(addrCoord(a))) addresses.set(addrCoord(a), a);
    } else if (t[0] === "p" && HEX64.test(v)) people.add(v.toLowerCase());
    else if (t[0] === "t") hashtags.add(v.replace(/^#/, "").toLowerCase());
    else if (t[0] === "r" && /^https?:\/\//i.test(v)) links.add(v);
  }
  const out = {
    notes: [...notes.values()],
    addresses: [...addresses.values()],
    people: [...people],
    hashtags: [...hashtags],
    links: [...links],
    sealed: contentShape(ev.content).kind === "encrypted",
  };
  return {
    ...out,
    total: out.notes.length + out.addresses.length + out.people.length + out.hashtags.length + out.links.length,
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** What an address is, as a noun: "article", "video", "community". */
export function addressNoun(kind: number, n = 1): string {
  const label = kindTypeLabel(kind);
  // A kind with no name here is an item, not "kind 31234s".
  const one = /^kind /i.test(label) ? "item" : label.toLowerCase();
  if (n === 1) return one;
  if (one.endsWith("y")) return `${one.slice(0, -1)}ies`;
  return one.endsWith("s") ? one : `${one}s`;
}

/**
 * What a list holds, in words, most first: ["6 notes"], or ["3 articles",
 * "2 links", "1 note"]. An `a` is counted as what it points at.
 */
export function listItemCounts(items: ListItems): string[] {
  const byKind = new Map<number, number>();
  for (const a of items.addresses) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);
  return [
    { n: items.notes.length, label: plural(items.notes.length, "note") },
    ...[...byKind].map(([kind, n]) => ({ n, label: `${n.toLocaleString()} ${addressNoun(kind, n)}` })),
    { n: items.people.length, label: plural(items.people.length, "person", "people") },
    { n: items.hashtags.length, label: plural(items.hashtags.length, "hashtag") },
    { n: items.links.length, label: plural(items.links.length, "link") },
  ]
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.label);
}

/**
 * What a list holds, said in one chip: "6 notes" when it is one kind of
 * thing, "8 items" when it mixes them, "Private" when all of it is sealed.
 */
export function listCountLabel(items: ListItems): string {
  const counts = listItemCounts(items);
  if (counts.length === 1) return counts[0];
  if (items.total) return `${items.total.toLocaleString()} items`;
  return items.sealed ? "Private" : "Empty";
}

/** The list's name: its `title`, else `name`, else what a kind like this one is called. */
export function listTitle(ev: { kind: number; tags: string[][] }): string {
  const named = ev.tags.find((t) => (t[0] === "title" || t[0] === "name") && t[1]?.trim())?.[1]?.trim();
  if (named) return named;
  if (ev.kind === 10003) return "Bookmarks";
  if (ev.kind === 10001) return "Pinned notes";
  if (ev.kind === 10015) return "Interests";
  if (ev.kind === 10004) return "Communities";
  const d = ev.tags.find((t) => t[0] === "d")?.[1]?.trim();
  return d || "Untitled list";
}
