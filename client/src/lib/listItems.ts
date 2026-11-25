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
import {
  TRUSTED_IDENTIFIERS_KIND,
  TRUSTED_ITEM_LIST_KINDS,
  TRUSTED_MEMBER_TAG,
  readTrustedList,
} from "@/lib/trustedList";

/**
 * The lists whose items are things to open: pins (10001), bookmarks (10003),
 * communities (10004), interests (10015), generic lists (30001), bookmark
 * sets (30003), curation sets of articles, videos and pictures
 * (30004–30006), interest sets (30015), NIP-58's badge lists — profile
 * badges (10008, and the deprecated 30008 `profile_badges` it replaced) and
 * badge sets (30008) — and the Trusted Lists of things (30393 events, 30394
 * addresses, 30395 external ids: lib/trustedList), which are read by their
 * member tag alone, never as a NIP-51 list.
 */
export const ITEM_LIST_KINDS: ReadonlySet<number> = new Set([
  10001,
  10003,
  10004,
  10008,
  10015,
  30001,
  30003,
  30004,
  30005,
  30006,
  30008,
  30015,
  ...TRUSTED_ITEM_LIST_KINDS,
]);

/**
 * NIP-58's badge lists: ordered pairs of an `a` (the kind-30009 badge) and an
 * `e` (the kind-8 award that proves it was given). The badge is the item; its
 * award is its receipt, never a note of its own.
 */
export const BADGE_LIST_KINDS: ReadonlySet<number> = new Set([10008, 30008]);

/** What a list's `e` items are, by NIP-51: notes, except a curation set of videos (30005) or pictures (30006). */
export type ListNoteNoun = "note" | "video" | "picture";
export function listNoteNoun(kind: number | undefined): ListNoteNoun {
  return kind === 30005 ? "video" : kind === 30006 ? "picture" : "note";
}

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
  /** NIP-73 external ids that are neither a link nor a hashtag (a Trusted List of identifiers, 30395). */
  identifiers: string[];
  /** Everything public, counted once. */
  total: number;
  /** The list also holds items sealed in its content, for its owner alone. */
  sealed: boolean;
  /** What its `e` items are: videos in a video curation set, pictures in a picture one. */
  noteNoun: ListNoteNoun;
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

/**
 * A Trusted List of things holds only its kind's member tag; its other
 * single-letter tags (a 30393's `a` to its tag, `p` to its observer) are
 * discovery metadata, not items. Members keep the list's order, best first.
 */
function trustedListItems(ev: { kind: number; tags: string[][] }): ListItems {
  const list = readTrustedList(ev);
  const tag = TRUSTED_MEMBER_TAG[ev.kind];
  // The members as tags again, best first, through the NIP-51 reading of that one tag.
  const rows = list.retracted ? [] : list.entries.map((m) => [tag, m.value, m.hint ?? ""]);
  if (ev.kind !== TRUSTED_IDENTIFIERS_KIND) {
    return readListItems({ tags: rows, content: "" });
  }
  const links: string[] = [];
  const hashtags: string[] = [];
  const identifiers: string[] = [];
  for (const [, v] of rows) {
    if (/^https?:\/\//i.test(v)) links.push(v);
    else if (v.startsWith("#") && v.length > 1) hashtags.push(v.slice(1).toLowerCase());
    else identifiers.push(v);
  }
  return {
    notes: [],
    addresses: [],
    people: [],
    hashtags,
    links,
    identifiers,
    noteNoun: "note",
    sealed: false,
    total: links.length + hashtags.length + identifiers.length,
  };
}

export function readListItems(ev: { kind?: number; tags: string[][]; content: string }): ListItems {
  if (ev.kind !== undefined && TRUSTED_ITEM_LIST_KINDS.has(ev.kind))
    return trustedListItems(ev as { kind: number; tags: string[][] });
  // A badge list's `e` is the award behind the badge beside it, not an item.
  const awards = ev.kind !== undefined && BADGE_LIST_KINDS.has(ev.kind);
  const notes = new Map<string, ListNote>();
  const addresses = new Map<string, AddressRef>();
  const people = new Set<string>();
  const hashtags = new Set<string>();
  const links = new Set<string>();
  for (const t of ev.tags) {
    const v = t[1];
    if (!v) continue;
    if (t[0] === "e" && HEX64.test(v)) {
      if (awards) continue;
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
    identifiers: [] as string[],
    sealed: contentShape(ev.content).kind === "encrypted",
    noteNoun: listNoteNoun(ev.kind),
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
    { n: items.notes.length, label: plural(items.notes.length, items.noteNoun) },
    ...[...byKind].map(([kind, n]) => ({ n, label: `${n.toLocaleString()} ${addressNoun(kind, n)}` })),
    { n: items.people.length, label: plural(items.people.length, "person", "people") },
    { n: items.hashtags.length, label: plural(items.hashtags.length, "hashtag") },
    { n: items.links.length, label: plural(items.links.length, "link") },
    { n: items.identifiers.length, label: plural(items.identifiers.length, "identifier") },
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
  if (isProfileBadges(ev)) return "Profile badges";
  const d = ev.tags.find((t) => t[0] === "d")?.[1]?.trim();
  return d || "Untitled list";
}

/**
 * NIP-58's profile badges: kind 10008, or the deprecated kind-30008 form it
 * replaced (`d` = `profile_badges`), which clients "should treat as equivalent".
 * Any other 30008 is a badge set.
 */
export function isProfileBadges(ev: { kind: number; tags: string[][] }): boolean {
  if (ev.kind === 10008) return true;
  return ev.kind === 30008 && ev.tags.find((t) => t[0] === "d")?.[1]?.trim() === "profile_badges";
}
