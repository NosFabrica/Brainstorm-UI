/**
 * The Music tab's view of the V4V lists (services/dlists): idle while it
 * is not the Music tab, loading then the lists once it is. Asks only when
 * enabled; an outage is two empty lists, not an error. No query client —
 * the Music tab's hooks stand on their own, as useWavlakeTrending does.
 */
import { useEffect, useState } from "react";
import { fetchPodcastIndexMusic, type PodcastIndexMusic } from "@/services/dlists";

type State = PodcastIndexMusic & { loading: boolean };
const IDLE: State = { songs: [], musicians: [], loading: false };

export function usePodcastIndexMusic(enabled: boolean): State {
  const [state, setState] = useState<State>(() => (enabled ? { ...IDLE, loading: true } : IDLE));
  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState((s) => (s.loading ? s : { ...IDLE, loading: true }));
    void fetchPodcastIndexMusic().then((music) => {
      if (!cancelled) setState({ ...music, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
