import { useEffect, useState } from "react";
import { fetchWavlakeTrending, type WavlakeSong } from "@/lib/wavlake";

/**
 * Wavlake's chart — top tracks by sats — for the Music tab's discovery front,
 * re-asked when the genre changes. Asks only when enabled; an outage is an
 * empty chart, not an error.
 */
export function useWavlakeTrending(genre: string | null, enabled: boolean): { songs: WavlakeSong[]; loading: boolean } {
  const [state, setState] = useState<{ songs: WavlakeSong[]; loading: boolean }>({ songs: [], loading: false });
  useEffect(() => {
    if (!enabled) {
      setState({ songs: [], loading: false });
      return;
    }
    let cancelled = false;
    setState({ songs: [], loading: true });
    fetchWavlakeTrending(genre ? { genre } : {}).then((songs) => {
      if (!cancelled) setState({ songs, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [genre, enabled]);
  return state;
}
