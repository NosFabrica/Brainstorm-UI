/** The Music tab's view of the network's tagged musicians (services/musicTags): idle off the tab, loading then the people on it. */
import { useEffect, useState } from "react";
import type { SearchResult } from "@/lib/profileSearch";
import { fetchTaggedMusicians } from "@/services/musicTags";

type State = { people: SearchResult[]; loading: boolean };
const IDLE: State = { people: [], loading: false };

export function useTaggedMusicians(enabled: boolean): State {
  const [state, setState] = useState<State>(() => (enabled ? { people: [], loading: true } : IDLE));
  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    setState((s) => (s.loading ? s : { people: [], loading: true }));
    void fetchTaggedMusicians().then((people) => {
      if (!cancelled) setState({ people, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return state;
}
