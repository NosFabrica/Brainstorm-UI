import { useEffect, useState } from "react";
import { findWavlakeArtist, wavlakeArtistTracks, type WavlakeArtist, type WavlakeSong } from "@/lib/wavlake";
import { fetchProfileMap } from "@/services/nostr";

export interface ArtistCatalogue {
  artist: WavlakeArtist | null;
  songs: WavlakeSong[];
  loading: boolean;
}

const IDLE: ArtistCatalogue = { artist: null, songs: [], loading: false };

/**
 * A person's Wavlake catalogue: the artist who IS them — by the Nostr key
 * they linked on Wavlake, else their exact name, never a loose match — and
 * that artist's songs, newest release first. The name comes from the caller
 * when it has one (the profile page) and from the person's kind-0 otherwise
 * (a search scoped to a key). Nobody on Wavlake, or an outage there, is an
 * empty catalogue, never an error.
 */
export function useArtistCatalogue(pubkey: string | null | undefined, opts: { name?: string | null; limit?: number } = {}): ArtistCatalogue {
  const { name, limit = 50 } = opts;
  const [state, setState] = useState<ArtistCatalogue>(IDLE);
  useEffect(() => {
    if (!pubkey) {
      setState(IDLE);
      return;
    }
    let alive = true;
    setState({ artist: null, songs: [], loading: true });
    (async () => {
      let who = name ?? null;
      if (!who) {
        const map = await fetchProfileMap([pubkey]).catch(() => new Map<string, { name?: string; display_name?: string }>());
        const p = map.get(pubkey) as { name?: string; display_name?: string } | undefined;
        who = p?.display_name || p?.name || null;
      }
      if (!alive) return;
      const artist = who ? await findWavlakeArtist({ name: who, pubkey }).catch(() => null) : null;
      if (!alive) return;
      if (!artist) {
        setState(IDLE);
        return;
      }
      const songs = await wavlakeArtistTracks(artist.id, limit).catch(() => [] as WavlakeSong[]);
      if (alive) setState({ artist, songs, loading: false });
    })();
    return () => {
      alive = false;
    };
  }, [pubkey, name, limit]);
  return state;
}
