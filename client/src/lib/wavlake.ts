// Resolve wavlake.com track links into playable metadata. Wavlake's catalog API
// is CORS-accessible from the browser, so a bare /track/<id> URL in a note can
// become a real player (artwork + title + artist + mp3 + duration).

import { useEffect, useState } from "react";
import { nip19 } from "nostr-tools";
import { nameMatchScore } from "@/lib/nameMatch";

export interface WavlakeTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  audioUrl: string;
  duration?: number; // seconds
  /** The artist's Nostr key when they linked one on Wavlake. */
  artistNpub?: string;
}

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Extract a Wavlake track id from a URL, else undefined: wavlake.com/track/<uuid>,
 * or a StableKraft album link — stablekraft.app is a storefront on Wavlake's
 * catalogue (probed 2026-09-05: its artwork is on Wavlake's CDN and the UUID
 * ending its `track` parameter answers at catalog.wavlake.com), so its songs
 * play here the way Wavlake's do.
 */
export function wavlakeTrackId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (/(^|\.)wavlake\.com$/i.test(u.hostname)) {
      const m = u.pathname.match(/\/track\/([0-9a-f-]{8,})/i);
      return m?.[1];
    }
    if (/(^|\.)stablekraft\.app$/i.test(u.hostname)) {
      const track = u.searchParams.get("track") ?? "";
      return track.match(UUID_TAIL)?.[1]?.toLowerCase();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export const wavlakeTrackUrl = (id: string) => `https://wavlake.com/track/${id}`;

const cache = new Map<string, WavlakeTrack | null>(); // null = resolved-but-failed

/** Fetch + cache Wavlake track metadata. Returns { loading, track, error }. */
export function useWavlakeTrack(id: string | undefined) {
  const [state, setState] = useState<{ loading: boolean; track: WavlakeTrack | null; error: boolean }>(() =>
    id && cache.has(id)
      ? { loading: false, track: cache.get(id)!, error: cache.get(id) === null }
      : { loading: !!id, track: null, error: false },
  );

  useEffect(() => {
    if (!id) return;
    if (cache.has(id)) {
      setState({ loading: false, track: cache.get(id)!, error: cache.get(id) === null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, track: null, error: false });
    fetch(`https://catalog.wavlake.com/v1/tracks/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        const d = j?.data;
        if (!d?.liveUrl) throw new Error("no media");
        const track: WavlakeTrack = {
          id,
          title: d.title || "Untitled track",
          artist: d.artist || "",
          artworkUrl: d.artworkUrl || d.avatarUrl || undefined,
          audioUrl: d.liveUrl,
          duration: Number(d.duration) || undefined,
          artistNpub: d.artistNpub || undefined,
        };
        cache.set(id, track);
        if (!cancelled) setState({ loading: false, track, error: false });
      })
      .catch(() => {
        cache.set(id, null);
        if (!cancelled) setState({ loading: false, track: null, error: true });
      });
    return () => { cancelled = true; };
  }, [id]);

  return state;
}

// ---------------------------------------------------------------------------
// Wavlake as a music SOURCE, not just a link to unfurl.
//
// Live probing (2026-09-04): the musicians Benjamin named publish no native
// track events at all — their music is on Wavlake, linked from notes. Wavlake's
// public API is open to the browser: a search names artists and albums, an
// artist lists albums, an album lists tracks with the mp3. So the words a
// listener types can find songs where musicians actually keep them, labelled
// as Wavlake's so nobody mistakes the source.
// ---------------------------------------------------------------------------

/** A Wavlake track in the shape our player and cards already speak. */
export interface WavlakeSong {
  /** Namespaced so a Wavlake id never collides with a Nostr event id in the queue. */
  id: string;
  title: string;
  artist: string;
  cover?: string;
  audio: string;
  durationSec?: number;
  /** The track's page on Wavlake — where zaps, albums and the artist live. */
  url: string;
  source: "wavlake";
  /** The artist's Nostr key when they linked one on Wavlake; "" otherwise. */
  artistNpub: string;
  /** Sats zapped to the track over the ranking's window — the trending signal. */
  sats?: number;
}

export interface WavlakeArtist {
  id: string;
  name: string;
  url: string;
  artworkUrl?: string;
  artistNpub: string;
}

const WAVLAKE_API = "https://wavlake.com/api/v1";
const WAVLAKE_CATALOG = "https://catalog.wavlake.com/v1";
const catalogueCache = new Map<string, Promise<unknown>>();

/** Test seam: forget every remembered answer. */
export function __resetWavlakeCatalogue() {
  catalogueCache.clear();
}

async function getJson<T>(url: string): Promise<T | null> {
  if (!catalogueCache.has(url)) {
    catalogueCache.set(
      url,
      fetch(url, { signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return (await catalogueCache.get(url)) as T | null;
}

type SearchItem = { id: string; type: string; name: string; url?: string; avatarUrl?: string; artworkUrl?: string };
type ArtistBody = { id: string; name: string; url?: string; artistArtUrl?: string; artistNpub?: string; albums?: { id: string; title: string; releaseDate?: string }[] };
type AlbumBody = { id: string; title: string; albumArtUrl?: string; tracks?: { id: string; title: string; artist?: string; duration?: number; mediaUrl?: string; artistNpub?: string }[] };

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function catalogueSearch(term: string): Promise<SearchItem[]> {
  const body = await getJson<{ success?: boolean; data?: SearchItem[] }>(`${WAVLAKE_CATALOG}/search?term=${encodeURIComponent(term.trim())}`);
  return Array.isArray(body?.data) ? body.data : [];
}

async function albumSongs(albumId: string): Promise<WavlakeSong[]> {
  const album = await getJson<AlbumBody>(`${WAVLAKE_API}/content/album/${encodeURIComponent(albumId)}`);
  return (album?.tracks ?? [])
    .filter((t) => t.id && t.title && t.mediaUrl)
    .map((t) => ({
      id: `wavlake:${t.id}`,
      title: t.title,
      artist: t.artist ?? "",
      cover: album?.albumArtUrl || undefined,
      audio: t.mediaUrl as string,
      durationSec: Number(t.duration) > 0 ? Number(t.duration) : undefined,
      url: wavlakeTrackUrl(t.id),
      source: "wavlake" as const,
      artistNpub: t.artistNpub ?? "",
    }));
}

/** An artist's songs, newest release first, capped. */
export async function wavlakeArtistTracks(artistId: string, limit = 6): Promise<WavlakeSong[]> {
  const artist = await getJson<ArtistBody>(`${WAVLAKE_API}/content/artist/${encodeURIComponent(artistId)}`);
  const albums = [...(artist?.albums ?? [])].sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  const out: WavlakeSong[] = [];
  for (const album of albums) {
    if (out.length >= limit) break;
    out.push(...(await albumSongs(album.id)));
  }
  return out.slice(0, limit);
}

export interface WavlakeAlbum {
  id: string;
  title: string;
  /** From the album's tracks when they were fetched; "" when only the name is known. */
  artist: string;
  artworkUrl?: string;
  url: string;
}

export interface WavlakeCatalogueHits {
  artists: WavlakeArtist[];
  albums: WavlakeAlbum[];
  songs: WavlakeSong[];
}

const EMPTY_HITS: WavlakeCatalogueHits = { artists: [], albums: [], songs: [] };

/**
 * What Wavlake has for these words, in the catalogue's own three shapes: the
 * artists and albums it names, and the songs behind them — the matching
 * artists' newest releases first, then the matching albums' tracks. Empty
 * lists, never a throw: an outage at Wavlake is not a search failure.
 */
export async function searchWavlake(term: string, limit = 6): Promise<WavlakeCatalogueHits> {
  const q = term.trim();
  if (q.length < 2) return EMPTY_HITS;
  const items = await catalogueSearch(q);
  // The catalogue's order is loose ("nova" leads with Freddy Donovan); the
  // artists whose NAME answers to the words come first, then the rest as given.
  const artists: WavlakeArtist[] = items
    .filter((i) => i.type === "artist")
    .map((i, idx) => ({ i, idx, score: nameMatchScore(i.name, q) }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, 3)
    .map(({ i }) => ({
      id: i.id,
      name: i.name,
      url: i.url ? `https://wavlake.com/${i.url}` : `https://wavlake.com/artist/${i.id}`,
      artworkUrl: i.avatarUrl || i.artworkUrl || undefined,
      artistNpub: "",
    }));
  const songs: WavlakeSong[] = [];
  const seen = new Set<string>();
  const push = (list: WavlakeSong[]) => {
    for (const s of list) if (!seen.has(s.id) && songs.length < limit) { seen.add(s.id); songs.push(s); }
  };
  for (const a of artists.slice(0, 2)) {
    if (songs.length >= limit) break;
    const tracks = await wavlakeArtistTracks(a.id, limit);
    const linked = tracks.find((t) => t.artistNpub)?.artistNpub;
    if (linked) a.artistNpub = linked;
    push(tracks);
  }
  const albums: WavlakeAlbum[] = [];
  for (const al of items.filter((i) => i.type === "album").slice(0, 6)) {
    const tracks = albums.length < 3 && songs.length < limit ? await albumSongs(al.id) : [];
    push(tracks);
    albums.push({
      id: al.id,
      title: al.name,
      artist: tracks[0]?.artist ?? "",
      artworkUrl: al.artworkUrl || al.avatarUrl || undefined,
      url: `https://wavlake.com/album/${al.id}`,
    });
  }
  return { artists, albums, songs };
}

/** The songs alone — the shape the Listen row and older callers speak. */
export async function searchWavlakeTracks(term: string, limit = 6): Promise<WavlakeSong[]> {
  return (await searchWavlake(term, limit)).songs;
}

/**
 * The Wavlake artist who IS this person. By linked Nostr key when the artist
 * set one, else by the exact name — never a loose match, because "ainsley"
 * naming Ainsley Costello would also name anyone else called Ainsley.
 */
export async function findWavlakeArtist({ name, pubkey }: { name?: string | null; pubkey?: string | null }): Promise<WavlakeArtist | null> {
  const wanted = name ? normalise(name) : "";
  if (!wanted) return null;
  const items = (await catalogueSearch(wanted)).filter((i) => i.type === "artist");
  const toArtist = (i: SearchItem, npub = ""): WavlakeArtist => ({
    id: i.id,
    name: i.name,
    url: i.url ? `https://wavlake.com/${i.url}` : `https://wavlake.com/artist/${i.id}`,
    artworkUrl: i.avatarUrl || i.artworkUrl || undefined,
    artistNpub: npub,
  });
  // A linked key is exact; check the candidates' records for it first.
  if (pubkey) {
    for (const i of items) {
      const body = await getJson<ArtistBody>(`${WAVLAKE_API}/content/artist/${encodeURIComponent(i.id)}`);
      if (body?.artistNpub && pubkeyMatches(body.artistNpub, pubkey)) return toArtist(i, body.artistNpub);
    }
  }
  const exact = items.find((i) => normalise(i.name) === wanted);
  return exact ? toArtist(exact) : null;
}

function pubkeyMatches(artistNpub: string, pubkey: string): boolean {
  if (!artistNpub) return false;
  if (artistNpub.toLowerCase() === pubkey.toLowerCase()) return true;
  try {
    return nip19.npubEncode(pubkey.toLowerCase()) === artistNpub;
  } catch {
    return false;
  }
}

type RankedTrack = { id: string; title: string; artist?: string; albumArtUrl?: string; artistArtUrl?: string; albumId?: string; albumTitle?: string; mediaUrl?: string; url?: string; msatTotal?: string; duration?: number };

/** Wavlake's genre names that its rankings answer for (probed 2026-09-04). */
export const WAVLAKE_GENRES = ["rock", "hip-hop", "pop", "electronic", "alternative", "country"] as const;
export type WavlakeGenre = (typeof WAVLAKE_GENRES)[number];

/**
 * What people are paying for: Wavlake's top tracks by sats over the last
 * week — a value-for-value chart no play-count list can fake. A week in one
 * genre can be thin, so fewer than six answers widens the window to a month.
 * Empty, never a throw.
 */
export async function fetchWavlakeTrending({ genre, limit = 12 }: { genre?: string; limit?: number } = {}): Promise<WavlakeSong[]> {
  const ask = async (days: number): Promise<WavlakeSong[]> => {
    const g = genre ? `&genre=${encodeURIComponent(genre)}` : "";
    const body = await getJson<RankedTrack[]>(`${WAVLAKE_API}/content/rankings?sort=sats&days=${days}&limit=${limit}${g}`);
    return (Array.isArray(body) ? body : [])
      .filter((t) => t.id && t.title && t.mediaUrl)
      .map((t) => ({
        id: `wavlake:${t.id}`,
        title: t.title,
        artist: t.artist ?? "",
        cover: t.albumArtUrl || t.artistArtUrl || undefined,
        audio: t.mediaUrl as string,
        durationSec: Number(t.duration) > 0 ? Number(t.duration) : undefined,
        url: t.url || wavlakeTrackUrl(t.id),
        source: "wavlake" as const,
        artistNpub: "",
        sats: Math.round(Number(t.msatTotal ?? 0) / 1000) || undefined,
      }));
  };
  const week = await ask(7);
  return week.length >= 6 ? week : ask(30).then((month) => (month.length > week.length ? month : week));
}
