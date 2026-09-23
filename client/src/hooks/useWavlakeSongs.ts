import { useEffect, useState } from "react";
import { searchWavlake, searchWavlakeTracks, type WavlakeCatalogueHits, type WavlakeSong } from "@/lib/wavlake";

/**
 * Wavlake's songs for the words being searched — the second music source
 * beside native tracks. Asks only when enabled (the Music tab, the Listen
 * row), remembers answers through the catalogue cache, and reports an outage
 * as an empty list, not an error: Wavlake being down is not a search failure.
 */
export function useWavlakeSongs(term: string, enabled: boolean): { songs: WavlakeSong[]; loading: boolean } {
  const [state, setState] = useState<{ term: string; songs: WavlakeSong[]; loading: boolean }>({ term: "", songs: [], loading: false });
  useEffect(() => {
    const q = term.trim();
    if (!enabled || q.length < 2) {
      setState({ term: q, songs: [], loading: false });
      return;
    }
    let cancelled = false;
    setState({ term: q, songs: [], loading: true });
    searchWavlakeTracks(q).then((songs) => {
      if (!cancelled) setState({ term: q, songs, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [term, enabled]);
  return { songs: state.songs, loading: state.loading };
}

const NO_HITS: WavlakeCatalogueHits = { artists: [], albums: [], songs: [] };

/**
 * Wavlake's catalogue for the words in its three shapes — artists, albums,
 * songs — for the Music tab's grouped results. Same manners as the songs
 * hook: asks only when enabled, an outage is three empty lists.
 */
export function useWavlakeSearch(term: string, enabled: boolean): WavlakeCatalogueHits & { loading: boolean } {
  const [state, setState] = useState<{ term: string; hits: WavlakeCatalogueHits; loading: boolean }>({ term: "", hits: NO_HITS, loading: false });
  useEffect(() => {
    const q = term.trim();
    if (!enabled || q.length < 2) {
      setState({ term: q, hits: NO_HITS, loading: false });
      return;
    }
    let cancelled = false;
    setState({ term: q, hits: NO_HITS, loading: true });
    searchWavlake(q).then((hits) => {
      if (!cancelled) setState({ term: q, hits, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [term, enabled]);
  return { ...state.hits, loading: state.loading };
}
