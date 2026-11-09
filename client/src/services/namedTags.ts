// The tags a search's words name outright, and everything carrying each — what
// a tag's tab in All's row holds.
//
// Read from the tag's Trusted Lists (services/tagLists) when the search relay has any whose
// titles hold the words: one list per kind of thing the tag is on, each with its members, best
// scored first, through the reader's perspective or else the house's.
//
// Words no list answers fall back to the tag's raw taggings — every tag until the trusted-list
// service's first run builds lists of notes and items (brainstorm_server ADR trusted-lists/0002).
// Two ways the search relay finds a tag by its name there:
// - a Trusted List of the tag's people (kind 30392, services/searchTags), for
//   tags anyone carries;
// - the tag's taggings header ("Taggings of events as Stoicism", a kind-39999
//   item on the tagging-with-specific-tag list), for tags only notes and items
//   carry. Probed 2026-10-29: "stoicism" finds Stoicism's header and no list.
//
// What carries the tag is read as the tag's own page reads it (services/tags):
// people from their profile taggings, everything else from the tag's event
// taggings — each counted when its tagger counts through the perspective and
// support beats disputes. Not from the Trusted List, so a tab and the tag
// filters (hooks/useResultTags) agree on who carries what.

import type { NostrEvent } from "nostr-tools";
import { fetchEventsByFilter, fetchEventsByIds } from "@/services/nostr";
import { fetchSearchTags } from "@/services/searchTags";
import {
  ADDRESS_LIST_KIND,
  EVENT_LIST_KIND,
  PEOPLE_LIST_KIND,
  fetchTagLists,
  tagNameOf,
  type TagList,
} from "@/services/tagLists";
import { fetchTagDetail, fetchTagNotes, type TrustObserver } from "@/services/tags";
import type { SearchPov } from "@/services/search";
import { tagMatchStrength } from "@/lib/tagMatch";
import { DCOSL_RELAY, PROFILE_RELAYS, SEARCH_RELAY } from "@/lib/relays";
import { dedupeRelays } from "@/lib/relayRouting";
import { Z_HANDLE_PUBKEYS } from "@/config/tagging";
import { conceptTaggingWithSpecificTag } from "@/lib/tagging-sdk/event-tagging/index.js";

/** A tag the words name, with what carries it. */
export interface NamedTag {
  /** `<tag author>|<slug>`. */
  key: string;
  authorPubkey: string;
  slug: string;
  name: string;
  /** The people carrying it, best first. */
  people: Array<{ pubkey: string; rank: number }>;
  /** Everything else carrying it — notes by id, list items and articles by address — best first. */
  things: Array<{ id?: string; address?: string; rank: number; relays: string[] }>;
}

/** At most this many tags get a tab: two words rarely name more than one. */
const MAX_TAGS = 2;
const HEADERS_LIMIT = 10;
const TAG_COORD = /^39999:([0-9a-f]{64}):(.+)$/;

interface Lens {
  pov: SearchPov;
  userPubkey?: string;
}

const memo = new Map<string, Promise<NamedTag[]>>();

/** Test seam: forget every answer. */
export function forgetNamedTags(): void {
  memo.clear();
  rowsMemo.clear();
}

/** The tags these words name outright, each with what carries it; asked once per visit. Never rejects. */
export function fetchNamedTags(query: string, lens: Lens): Promise<NamedTag[]> {
  const words = query.trim();
  if (words.length < 2) return Promise.resolve([]);
  const observer: TrustObserver = lens.pov === "mywot" && lens.userPubkey ? lens.userPubkey : "house";
  const key = `${observer}|${words.toLowerCase()}`;
  let pending = memo.get(key);
  if (!pending) {
    pending = ask(words, lens, observer).catch(() => []);
    memo.set(key, pending);
  }
  return pending;
}

async function ask(words: string, lens: Lens, observer: TrustObserver): Promise<NamedTag[]> {
  const fromLists = namedFromLists(words, await fetchTagLists(words, lens));
  return fromLists.length ? best(fromLists) : best(await fromTaggings(words, lens, observer));
}

const best = (tags: NamedTag[]) => tags.sort((a, b) => namedTagCount(b) - namedTagCount(a)).slice(0, MAX_TAGS);

/** Each tag the lists are of whose own name the words name: its people's list and its lists of things. */
export function namedFromLists(words: string, lists: readonly TagList[]): NamedTag[] {
  const byTag = new Map<string, TagList[]>();
  for (const l of lists) byTag.set(l.tagKey, [...(byTag.get(l.tagKey) ?? []), l]);
  return [...byTag.entries()].flatMap(([key, of]) => {
    const name = tagNameOf(of);
    if (tagMatchStrength(words, name) !== "strong") return [];
    const members = (kind: number) => of.filter((l) => l.kind === kind).flatMap((l) => l.members);
    const tag: NamedTag = {
      key,
      authorPubkey: of[0].authorPubkey,
      slug: of[0].slug,
      name,
      people: members(PEOPLE_LIST_KIND).map((m) => ({ pubkey: m.target, rank: m.score })),
      things: [
        ...members(EVENT_LIST_KIND).map((m) => ({ id: m.target, rank: m.score, relays: [] })),
        ...members(ADDRESS_LIST_KIND).map((m) => ({ address: m.target, rank: m.score, relays: [] })),
      ],
    };
    return namedTagCount(tag) > 0 ? [tag] : [];
  });
}

/** The tags the words name, read from their raw taggings. */
async function fromTaggings(words: string, lens: Lens, observer: TrustObserver): Promise<NamedTag[]> {
  const [lists, headers] = await Promise.all([
    fetchSearchTags(words, lens).catch(() => []),
    fetchEventsByFilter(
      {
        kinds: [39999],
        "#z": Z_HANDLE_PUBKEYS.map(conceptTaggingWithSpecificTag),
        search: `${words} include:spam`,
        limit: HEADERS_LIMIT,
      },
      [SEARCH_RELAY],
    ).catch(() => []),
  ]);
  // Every tag found either way, once, as `<author>|<slug>` — those whose slug the words could
  // name: a slug is its name slugged, so one the words don't name needs no reading.
  const found = new Map<string, { authorPubkey: string; slug: string }>();
  const maybe = (slug: string) => tagMatchStrength(words, slug.replace(/-/g, " ")) === "strong";
  for (const t of lists)
    if (maybe(t.slug)) found.set(`${t.authorPubkey}|${t.slug}`, { authorPubkey: t.authorPubkey, slug: t.slug });
  for (const h of headers) {
    const m = TAG_COORD.exec(h.tags.find((t) => t[0] === "a")?.[1] ?? "");
    if (m && maybe(m[2])) found.set(`${m[1]}|${m[2]}`, { authorPubkey: m[1], slug: m[2] });
  }
  const named = await Promise.all(
    [...found.entries()].map(async ([key, { authorPubkey, slug }]) => {
      const detail = await fetchTagDetail(authorPubkey, slug, undefined, observer);
      if (detail.status !== "ok" || tagMatchStrength(words, detail.tag.name) !== "strong") return null;
      const things = await fetchTagNotes(authorPubkey, slug, undefined, observer).catch(() => []);
      const tag: NamedTag = {
        key,
        authorPubkey,
        slug,
        name: detail.tag.name,
        people: detail.carriers.map((c) => ({ pubkey: c.pubkey, rank: c.applications })),
        things: things.map((t) => ({ id: t.id, address: t.address, rank: t.applications, relays: t.relays })),
      };
      return namedTagCount(tag) > 0 ? tag : null;
    }),
  );
  return named.filter((t): t is NamedTag => !!t);
}

/** How many things carry a named tag: its tab's whole count. */
export const namedTagCount = (tag: NamedTag) => tag.people.length + tag.things.length;

const rowsMemo = new Map<string, Promise<NostrEvent[]>>();

/**
 * The events behind what carries a tag, in its order: each person's profile, each note, each list
 * item or article. Asked of the app's relays (the search relay among them) and the tag hub, where
 * Dictionary items live, with the relays the taggers named a note at. One may not be found.
 */
export function fetchNamedTagRows(tag: NamedTag): Promise<NostrEvent[]> {
  let pending = rowsMemo.get(tag.key);
  if (!pending) {
    pending = rowsOf(tag).catch(() => []);
    rowsMemo.set(tag.key, pending);
  }
  return pending;
}

async function rowsOf(tag: NamedTag): Promise<NostrEvent[]> {
  const relays = dedupeRelays([...PROFILE_RELAYS, DCOSL_RELAY, ...tag.things.flatMap((t) => t.relays)]);
  const ids = tag.things.flatMap((t) => (t.id ? [t.id] : []));
  const coords = tag.things.flatMap((t) => {
    const m = t.address && /^(\d+):([0-9a-f]{64}):(.*)$/.exec(t.address);
    return m ? [{ address: t.address!, kind: Number(m[1]), pubkey: m[2], d: m[3] }] : [];
  });
  const kinds = [...new Set(coords.map((c) => c.kind))];
  const [profiles, notes, ...addressed] = await Promise.all([
    tag.people.length
      ? fetchEventsByFilter({ kinds: [0], authors: tag.people.map((p) => p.pubkey) }, relays).catch(() => [])
      : [],
    ids.length ? fetchEventsByIds(ids, relays).catch(() => []) : [],
    // One ask per kind, across its authors and `d`s: the cross product can bring back more, so
    // only the coordinates asked are kept.
    ...kinds.map((kind) => {
      const of = coords.filter((c) => c.kind === kind);
      return fetchEventsByFilter(
        { kinds: [kind], authors: [...new Set(of.map((c) => c.pubkey))], "#d": [...new Set(of.map((c) => c.d))] },
        relays,
      ).catch(() => []);
    }),
  ]);
  const newest = (events: NostrEvent[], keyOf: (e: NostrEvent) => string) => {
    const by = new Map<string, NostrEvent>();
    for (const e of events) {
      const k = keyOf(e);
      if ((by.get(k)?.created_at ?? -1) < e.created_at) by.set(k, e);
    }
    return by;
  };
  const people = newest(profiles, (e) => e.pubkey);
  const byId = new Map(notes.map((e) => [e.id, e]));
  const byAddress = newest(
    addressed.flat(),
    (e) => `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`,
  );
  // Best first, people and things alike; on a tie, the order the tag gave them.
  const order = [
    ...tag.people.map((p) => ({ event: people.get(p.pubkey), rank: p.rank })),
    ...tag.things.map((t) => ({
      event: t.id ? byId.get(t.id) : t.address ? byAddress.get(t.address) : undefined,
      rank: t.rank,
    })),
  ].sort((a, b) => b.rank - a.rank);
  return order.flatMap((o) => (o.event ? [o.event] : []));
}
