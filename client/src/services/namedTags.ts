// The tags a search's words name outright, and everything carrying each — what
// a tag's tab in All's row holds.
//
// Two ways the search relay finds a tag by its name:
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
import { fetchTagDetail, fetchTagNotes, type TaggedNote, type TrustObserver } from "@/services/tags";
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
  /** The people carrying it, most vouched first. */
  people: Array<{ pubkey: string; applications: number; addedAt: number }>;
  /** Everything else carrying it — notes by id, list items and articles by coordinate. */
  things: TaggedNote[];
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
        people: detail.carriers.map((c) => ({ pubkey: c.pubkey, applications: c.applications, addedAt: c.addedAt })),
        things,
      };
      return tag.people.length + tag.things.length > 0 ? tag : null;
    }),
  );
  return named
    .filter((t): t is NamedTag => !!t)
    .sort((a, b) => b.people.length + b.things.length - (a.people.length + a.things.length))
    .slice(0, MAX_TAGS);
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
  // Most vouched first, people and things alike; the newest tagged breaks a tie.
  const order = [
    ...tag.people.map((p) => ({ event: people.get(p.pubkey), applications: p.applications, addedAt: p.addedAt })),
    ...tag.things.map((t) => ({
      event: t.id ? byId.get(t.id) : t.address ? byAddress.get(t.address) : undefined,
      applications: t.applications,
      addedAt: t.addedAt,
    })),
  ].sort((a, b) => b.applications - a.applications || b.addedAt - a.addedAt);
  return order.flatMap((o) => (o.event ? [o.event] : []));
}
