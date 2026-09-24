/**
 * The V4V music lists' items, asked of the tag hub and read as songs and
 * musicians (lib/dlists). One query for both lists — their coordinates in
 * a single `#z` filter, the pattern services/tags uses — once per session:
 * the lists change rarely. A republished item (kind 9999 is a regular
 * kind, so a republish is a second event) counts once, newest winning. A
 * hub that fails or times out is two empty lists, silently, and is asked
 * again on the next visit — the Music tab then looks as it did before.
 */
import { fetchEventsByFilter } from "@/services/nostr";
import { tagRelays } from "@/config/tagging";
import {
  DLIST_ITEM_KIND,
  DLIST_REGISTRY,
  dlistCoordinateOf,
  dlistFor,
  parseDListMusician,
  parseDListSong,
  type PodcastIndexMusic,
  type PodcastMusician,
  type PodcastSong,
} from "@/lib/dlists";

export type { PodcastIndexMusic };

const EMPTY: PodcastIndexMusic = { songs: [], musicians: [] };
const MUSIC_COORDS = DLIST_REGISTRY.filter((e) => e.category === "music").map((e) => e.coordinate);

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
  const events = await fetchEventsByFilter({ kinds: [DLIST_ITEM_KIND], "#z": MUSIC_COORDS, limit: 500 }, tagRelays());
  const songs: { item: PodcastSong; key: string; at: number }[] = [];
  const musicians: { item: PodcastMusician; key: string; at: number }[] = [];
  for (const ev of events) {
    const coordinate = dlistCoordinateOf(ev);
    const list = coordinate ? dlistFor(coordinate) : null;
    if (!list) continue;
    if (list.shape === "song") {
      const song = parseDListSong(ev);
      if (song) songs.push({ item: song, key: song.audio, at: ev.created_at });
    } else {
      const musician = parseDListMusician(ev);
      if (musician) musicians.push({ item: musician, key: musician.feedGuid ?? musician.name.toLowerCase(), at: ev.created_at });
    }
  }
  return { songs: newestBy(songs), musicians: newestBy(musicians) };
}

let cached: Promise<PodcastIndexMusic> | null = null;

export function fetchPodcastIndexMusic(): Promise<PodcastIndexMusic> {
  if (cached) return cached;
  const p = lookup().catch(() => {
    cached = null; // a failure is not remembered: the next visit asks again
    return EMPTY;
  });
  cached = p;
  return p;
}

/** Test seam. */
export function __resetPodcastIndexCache(): void {
  cached = null;
}
