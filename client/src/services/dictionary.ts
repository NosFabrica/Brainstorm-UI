/**
 * A reader's Dictionary, read from the tag hub: for each concept the app
 * shows (config/dictionary), its community header, the copies that point at
 * it — the reader's own, their Tapestry Assistant's, Brainstorm's — and the
 * items filed under any of them. lib/conceptResolution decides which copy
 * governs; this only gathers the candidates.
 *
 * Two rounds: headers (community and copies, at once), then the items of
 * every header that may govern — a curated copy's items are the ones filed
 * under it, the community's under the community header. A copy of an item
 * (tapestry's curation copies, `d` = `copy-…` with a `q` naming its original)
 * counts as its original, so a list and its curation don't count twice.
 *
 * A relay that fails or times out reads as empty: no copies, no items. The
 * page says what it found, not that the network is down.
 */
import { DICTIONARY_CONCEPTS, HOUSE_CONCEPT_AUTHORS, dictionaryRelays } from "@/config/dictionary";
import { fetchEventsByFilter } from "@/services/nostr";
import { DLIST_ITEM_KINDS, coordinateOf, isDListItem, parseCoordinate } from "@/lib/dlistFields";
import { pointsAt, resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";

export interface DictionaryReader {
  /** The Active Account, or null for an anonymous reader. */
  pubkey: string | null;
  /** Their Tapestry Assistant, when they have one. */
  taPubkey: string | null;
}

export interface DictionaryItem {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
}

export interface DictionaryEntry {
  communityCoordinate: string;
  /** Null when neither the community header nor any copy was found. */
  resolved: ResolvedConcept | null;
  /** The reader's own copy (theirs or their Assistant's) governs — the concept is in their Dictionary. */
  inDictionary: boolean;
  /** Distinct items, newest version of each, newest first. */
  items: DictionaryItem[];
}

const TIMEOUT_MS = 8000;
const ITEM_LIMIT = 500;

const zValues = (ev: { tags: string[][] }) => ev.tags.filter((t) => t[0] === "z" && t[1]).map((t) => t[1]);

/**
 * What makes two events one item: a curation copy is its original (its
 * address `q`, else its version `q`); an addressable item is its
 * coordinate; anything else is its id.
 */
export function itemIdentity(ev: DictionaryItem): string {
  const d = ev.tags.find((t) => t[0] === "d")?.[1];
  if (d?.startsWith("copy-")) {
    const q = ev.tags.filter((t) => t[0] === "q" && t[1]);
    const original = q.find((t) => parseCoordinate(t[1])) ?? q[0];
    if (original) return original[1];
  }
  return coordinateOf(ev) ?? ev.id;
}

/** The newest version of each item, newest first. A tie keeps the original over its copy. */
export function distinctItems(events: DictionaryItem[]): DictionaryItem[] {
  const best = new Map<string, DictionaryItem>();
  for (const ev of events) {
    const key = itemIdentity(ev);
    const cur = best.get(key);
    if (!cur || ev.created_at > cur.created_at) best.set(key, ev);
  }
  return [...best.values()].sort((a, b) => b.created_at - a.created_at);
}

function newestPerCoordinate(events: HeaderEvent[]): Map<string, HeaderEvent> {
  const out = new Map<string, HeaderEvent>();
  for (const ev of events) {
    const coord = coordinateOf(ev);
    if (!coord) continue;
    const cur = out.get(coord);
    if (!cur || ev.created_at > cur.created_at) out.set(coord, ev);
  }
  return out;
}

/**
 * One author's copy of a community concept: the header pointing at it,
 * preferring the one sharing its `d` (the convention a copy follows), else
 * the newest.
 */
function copyBy(author: string | null, community: string, copies: HeaderEvent[]): HeaderEvent | null {
  if (!author) return null;
  const d = parseCoordinate(community)?.d;
  const mine = copies.filter((h) => h.pubkey === author && pointsAt(h, community));
  return (
    mine.find((h) => h.tags.some((t) => t[0] === "d" && t[1] === d)) ??
    mine.sort((a, b) => b.created_at - a.created_at)[0] ??
    null
  );
}

export async function loadDictionary(
  reader: DictionaryReader,
  concepts: string[] = DICTIONARY_CONCEPTS,
  relays: string[] = dictionaryRelays(),
  { items: withItems = true }: { items?: boolean } = {},
): Promise<DictionaryEntry[]> {
  const parsed = concepts.map((c) => parseCoordinate(c)).filter((c) => c?.kind === 39998);
  if (!parsed.length) return [];
  const copyAuthors = [
    ...new Set([reader.pubkey, reader.taPubkey, ...HOUSE_CONCEPT_AUTHORS].filter((a): a is string => !!a)),
  ];

  // The community headers and the copies, as ONE subscription with two filters: half
  // the subscriptions on a relay that caps them (the tag hub allows 20), and a failed
  // read becomes visible — the configured concepts' headers always exist, so a read
  // with none of them failed (a relay at its limit answers with nothing), where an
  // empty copies filter alone is the normal answer for a reader with no copies.
  // Retried once, and only then.
  const filters = [
    {
      kinds: [39998],
      authors: [...new Set(parsed.map((c) => c!.pubkey))],
      "#d": [...new Set(parsed.map((c) => c!.d))],
    },
    ...(copyAuthors.length ? [{ kinds: [39998], authors: copyAuthors, "#b": concepts }] : []),
  ];
  const read = () =>
    (fetchEventsByFilter(filters as never, relays, TIMEOUT_MS) as Promise<HeaderEvent[]>).catch(
      () => [] as HeaderEvent[],
    );
  const conceptSet = new Set(concepts);
  const hasCommunity = (events: HeaderEvent[]) => events.some((e) => conceptSet.has(coordinateOf(e) ?? ""));
  let headerEvents = await read();
  if (!hasCommunity(headerEvents)) headerEvents = await read();
  const byCoordinate = newestPerCoordinate(headerEvents);
  const communityHeaders = new Map([...byCoordinate].filter(([coord]) => conceptSet.has(coord)));
  const copies = [...byCoordinate.values()].filter(
    (h) => copyAuthors.includes(h.pubkey) && !conceptSet.has(coordinateOf(h) ?? ""),
  );

  const resolved = concepts.map((coordinate) =>
    resolveConcept({
      community: communityHeaders.get(coordinate) ?? null,
      communityCoordinate: coordinate,
      personal: copyBy(reader.pubkey, coordinate, copies),
      assistant: copyBy(reader.taPubkey, coordinate, copies),
      house: HOUSE_CONCEPT_AUTHORS.map((a) => copyBy(a, coordinate, copies)).find(Boolean) ?? null,
    }),
  );

  // Every header whose items may be the list: the community's and the governing copy's.
  const headersOf = (i: number) => new Set([concepts[i], ...(resolved[i]?.chain ?? [])]);
  const allHeaders = [...new Set(concepts.flatMap((_, i) => [...headersOf(i)]))];
  // An item page needs the concept, not the whole list: `items: false` skips the round.
  const itemEvents = withItems
    ? ((await fetchEventsByFilter(
        { kinds: [...DLIST_ITEM_KINDS], "#z": allHeaders, limit: ITEM_LIMIT },
        relays,
        TIMEOUT_MS,
      ).catch(() => [])) as DictionaryItem[])
    : [];
  const items = itemEvents.filter(isDListItem);

  return concepts.map((communityCoordinate, i) => {
    const mine = headersOf(i);
    const r = resolved[i];
    return {
      communityCoordinate,
      resolved: r,
      inDictionary: r?.source === "personal" || r?.source === "assistant",
      items: distinctItems(items.filter((ev) => zValues(ev).some((z) => mine.has(z)))),
    };
  });
}

/**
 * The Dictionary concept an item belongs to: the community coordinate its
 * `z` names, when that is a concept the app shows. Synchronous, so a page
 * can choose its renderer before anything loads. An item filed only under
 * someone's copy (a curation copy) isn't recognised yet — the copy's `b`
 * would have to be fetched first.
 */
export function dictionaryConceptOf(ev: { kind: number; tags: string[][] }): string | null {
  if (!isDListItem(ev)) return null;
  return zValues(ev).find((z) => DICTIONARY_CONCEPTS.includes(z)) ?? null;
}
