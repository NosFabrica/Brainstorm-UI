/**
 * The V4V music lists' items, asked of the tag hub and read as songs and
 * musicians (lib/dlists). First the curators' headers, for any list they
 * tagged with a category since the last deploy; then one query for every
 * list's items — the coordinates in a single `#z` filter, the pattern
 * services/tags uses. Once per ten minutes: the lists change rarely, and
 * a tab open all day should still catch a new album. A republished item (kind 9999 is a regular
 * kind, so a republish is a second event) counts once, newest winning; a
 * musician with several feeds is one face. A
 * hub that fails or times out is two empty lists, silently, and is asked
 * again on the next visit — the Music tab then looks as it did before.
 */
import { fetchEventsByFilter } from "@/services/nostr";
import { tagRelays } from "@/config/tagging";
import {
  CURATOR_PUBKEYS,
  DLIST_HEADER_KIND,
  DLIST_ITEM_KIND,
  DLIST_REGISTRY,
  dlistCoordinateOf,
  dlistFor,
  dlistsFromHeaders,
  parseDListMusician,
  parseDListSong,
  type DListEntry,
  type PodcastIndexMusic,
  type PodcastMusician,
  type PodcastSong,
} from "@/lib/dlists";

export type { PodcastIndexMusic };

const EMPTY: PodcastIndexMusic = { songs: [], musicians: [] };
/** How long an answer stands before the hub is asked again. */
const TTL_MS = 10 * 60_000;

/** The music lists: the shipped registry, plus any the curators tagged on the hub. */
async function musicLists(relays: string[]): Promise<DListEntry[]> {
  const headers = await fetchEventsByFilter({ kinds: [DLIST_HEADER_KIND], authors: CURATOR_PUBKEYS }, relays).catch(() => []);
  const byCoord = new Map<string, DListEntry>();
  for (const e of [...DLIST_REGISTRY, ...dlistsFromHeaders(headers)]) if (e.category === "music") byCoord.set(e.coordinate, e);
  return [...byCoord.values()];
}

/** Newest of each key wins; the order is newest first. */
function newestBy<T>(items: { item: T; key: string; at: number }[]): T[] {
  const best = new Map<string, { item: T; at: number }>();
  for (const { item, key, at } of items) {
    const cur = best.get(key);
    if (!cur || at > cur.at) best.set(key, { item, at });
  }
  return [...best.values()].sort((a, b) => b.at - a.at).map((x) => x.item);
}

async function lookup(): Promise<PodcastIndexMusic> {
  const relays = tagRelays();
  const lists = await musicLists(relays);
  const events = await fetchEventsByFilter({ kinds: [DLIST_ITEM_KIND], "#z": lists.map((l) => l.coordinate), limit: 500 }, relays);
  const songs: { item: PodcastSong; key: string; at: number }[] = [];
  const musicians: { item: PodcastMusician; key: string; at: number }[] = [];
  for (const ev of events) {
    const coordinate = dlistCoordinateOf(ev);
    if (!coordinate || !dlistFor(coordinate, lists)) continue;
    // The item's fields say what it is: a song has a title and a url, a musician a name.
    const song = parseDListSong(ev);
    if (song) {
      songs.push({ item: song, key: song.audio, at: ev.created_at });
      continue;
    }
    const musician = parseDListMusician(ev);
    if (musician) musicians.push({ item: musician, key: musician.feedGuid ?? musician.name.toLowerCase(), at: ev.created_at });
  }
  // A republished feed counts once (by guid); then one face per musician,
  // however many album feeds they publish (live: four Robert Willeys).
  const byFeed = newestBy(musicians).map((item) => ({ item, key: item.name.trim().toLowerCase(), at: musicians.find((m) => m.item === item)!.at }));
  return { songs: newestBy(songs), musicians: newestBy(byFeed) };
}

let cached: { promise: Promise<PodcastIndexMusic>; at: number } | null = null;

export function fetchPodcastIndexMusic(): Promise<PodcastIndexMusic> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.promise;
  const entry = { at: Date.now(), promise: lookup() };
  entry.promise = entry.promise.catch(() => {
    if (cached === entry) cached = null; // a failure is not remembered: the next visit asks again
    return EMPTY;
  });
  cached = entry;
  return entry.promise;
}

/** Test seam. */
export function __resetPodcastIndexCache(): void {
  cached = null;
}
