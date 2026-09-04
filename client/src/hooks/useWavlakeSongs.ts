import { useEffect, useState } from "react";
import { searchWavlakeTracks, type WavlakeSong } from "@/lib/wavlake";

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
