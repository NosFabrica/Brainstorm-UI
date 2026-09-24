/**
 * The Decentralized Lists the app reads as content, and what their items
 * name. The team (2026-09-24) favoured D-lists over hardcoded kinds as the
 * source of categories; the first is music: two lists from Podcast Index,
 * V4V Songs and V4V Musicians, curated on the tag hub.
 *
 * A list is a kind-39998 header; its coordinate `39998:<author>:<d>` is
 * how everything refers to it. Its items are kind-9999 events whose `z`
 * tag names the coordinate — they point at Podcast Index feeds, not at
 * Nostr profiles or notes, so they read as songs and musicians: content
 * for the Music tab, not badges on people.
 *
 * The registry maps a coordinate to its category and the category to its
 * icon. A header `icon` field can replace the icon map when the lists
 * carry one. The grammar only; fetching is services/dlists.
 */
import { Music, type LucideIcon } from "lucide-react";
import { scopeOf } from "@/lib/searchSyntax";
import raw from "@/config/dlists.config.json";

export const DLIST_HEADER_KIND = 39998;
export const DLIST_ITEM_KIND = 9999;

export type DListCategory = "music";
export type DListShape = "song" | "musician";

export interface DListEntry {
  coordinate: string;
  name: string;
  category: DListCategory;
  shape: DListShape;
}

type EventLike = { id: string; pubkey: string; kind: number; created_at: number; content: string; tags: string[][] };

const config = raw as { author: string; lists: { d: string; name: string; category: DListCategory; shape: DListShape }[] };

export const DLIST_REGISTRY: DListEntry[] = config.lists.map((l) => ({
  coordinate: `${DLIST_HEADER_KIND}:${config.author}:${l.d}`,
  name: l.name,
  category: l.category,
  shape: l.shape,
}));

/** The icon a category wears, wherever it shows. */
export const CATEGORY_ICON: Record<DListCategory, LucideIcon> = { music: Music };

/** The keys whose lists the app shows — the team's curators. A shelf is editorial space; anyone on the hub being able to add one is an invitation to spam. */
export const CURATOR_PUBKEYS: string[] = [config.author];

const isCategory = (v: string | undefined): v is DListCategory => !!v && v in CATEGORY_ICON;

/**
 * Lists the curators tagged for a category on their kind-39998 headers —
 * the team's convention to come, so a new list joins without a deploy. A
 * header names its shape only by what its items carry; the items decide.
 */
export function dlistsFromHeaders(headers: { pubkey: string; kind: number; tags: string[][] }[]): DListEntry[] {
  const out: DListEntry[] = [];
  for (const h of headers) {
    if (h.kind !== DLIST_HEADER_KIND || !CURATOR_PUBKEYS.includes(h.pubkey)) continue;
    const d = h.tags.find((t) => t[0] === "d")?.[1];
    const category = h.tags.find((t) => t[0] === "category")?.[1]?.trim().toLowerCase();
    if (!d || !isCategory(category)) continue;
    out.push({ coordinate: `${DLIST_HEADER_KIND}:${h.pubkey}:${d}`, name: h.tags.find((t) => t[0] === "name")?.[1]?.trim() || d, category, shape: "song" });
  }
  return out;
}

export function dlistFor(coordinate: string, lists: DListEntry[] = DLIST_REGISTRY): (DListEntry & { icon: LucideIcon }) | null {
  const entry = lists.find((e) => e.coordinate === coordinate);
  return entry ? { ...entry, icon: CATEGORY_ICON[entry.category] } : null;
}

/** The list an item belongs to — its first `z` tag — or null. */
export function dlistCoordinateOf(ev: { tags: string[][] }): string | null {
  return ev.tags.find((t) => t[0] === "z")?.[1] || null;
}

const tagOf = (ev: { tags: string[][] }, key: string): string | undefined => ev.tags.find((t) => t[0] === key)?.[1]?.trim() || undefined;
const isHttp = (u: string | undefined): u is string => !!u && /^https?:\/\//i.test(u);

export interface PodcastSong {
  /** `podcastindex:<eventId>` — never a native track's id or a Wavlake id. */
  id: string;
  eventId: string;
  title: string;
  artist: string;
  audio: string;
  cover?: string;
  durationSec?: number;
  feedId?: string;
  feedGuid?: string;
  /** The song's page on podcastindex.org. */
  url?: string;
  source: "podcastindex";
}

export interface PodcastMusician {
  id: string;
  name: string;
  feedUrl?: string;
  feedId?: string;
  feedGuid?: string;
  artwork?: string;
  /** The musician's page on podcastindex.org. */
  url?: string;
  source: "podcastindex";
}

/** A feed named by its owner's email address is not a musician's name, nor a song's artist. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const feedPage = (feedId: string | undefined): string | undefined => (feedId ? `https://podcastindex.org/podcast/${feedId}` : undefined);

export function parseDListSong(ev: EventLike): PodcastSong | null {
  if (ev.kind !== DLIST_ITEM_KIND) return null;
  const title = tagOf(ev, "title");
  const audio = tagOf(ev, "url");
  if (!title || !isHttp(audio)) return null;
  const duration = Number(tagOf(ev, "duration"));
  // The song's page on podcastindex.org when the `t` tag is one; else the feed's page — where the value splits live either way.
  const page = tagOf(ev, "t");
  const artist = tagOf(ev, "artist") ?? "";
  return {
    id: `podcastindex:${ev.id}`,
    eventId: ev.id,
    title,
    artist: EMAIL.test(artist) ? "" : artist,
    audio,
    cover: tagOf(ev, "artwork"),
    durationSec: Number.isFinite(duration) && duration > 0 ? duration : undefined,
    feedId: tagOf(ev, "feedId"),
    feedGuid: tagOf(ev, "feedGuid"),
    url: isHttp(page) ? page : feedPage(tagOf(ev, "feedId")),
    source: "podcastindex",
  };
}

export function parseDListMusician(ev: EventLike): PodcastMusician | null {
  if (ev.kind !== DLIST_ITEM_KIND) return null;
  const name = tagOf(ev, "name");
  if (!name || EMAIL.test(name)) return null;
  const feedId = tagOf(ev, "feedId");
  return {
    id: `podcastindex:${ev.id}`,
    name,
    feedUrl: tagOf(ev, "feedUrl"),
    feedId,
    feedGuid: tagOf(ev, "feedGuid"),
    artwork: tagOf(ev, "artwork"),
    url: feedPage(feedId),
    source: "podcastindex",
  };
}

export interface PodcastIndexMusic {
  songs: PodcastSong[];
  musicians: PodcastMusician[];
}

/**
 * What the words keep: everything with no words; else every word must
 * appear in a song's title or artist, a musician's name. A `from:` or `to:`
 * scope is not a word — the lists are not per person.
 */
export function filterPodcastIndex(query: string, hits: PodcastIndexMusic): PodcastIndexMusic {
  const text = (scopeOf(query)?.rest ?? query).toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return hits;
  const has = (hay: string) => words.every((w) => hay.includes(w));
  return {
    songs: hits.songs.filter((s) => has(`${s.title} ${s.artist}`.toLowerCase())),
    musicians: hits.musicians.filter((m) => has(m.name.toLowerCase())),
  };
}
