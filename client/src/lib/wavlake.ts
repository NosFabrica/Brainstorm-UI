// Resolve wavlake.com track links into playable metadata. Wavlake's catalog API
// is CORS-accessible from the browser, so a bare /track/<id> URL in a note can
// become a real player (artwork + title + artist + mp3 + duration).

import { useEffect, useState } from "react";

export interface WavlakeTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  audioUrl: string;
  duration?: number; // seconds
}

/** Extract a Wavlake track id from a URL (wavlake.com/track/<uuid>), else undefined. */
export function wavlakeTrackId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!/(^|\.)wavlake\.com$/i.test(u.hostname)) return undefined;
    const m = u.pathname.match(/\/track\/([0-9a-f-]{8,})/i);
    return m?.[1];
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
