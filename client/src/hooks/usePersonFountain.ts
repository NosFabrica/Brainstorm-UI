/**
 * The songs and episodes a person linked on Fountain, from their recent
 * notes — the same source the knowledge panel plays beside a search. Matt
 * Finlay, first face on the Musicians shelf, had an empty music view while
 * his panel played his Fountain episodes (Benjamin, 2026-09-24). Asked only
 * for one person on the Music tab; an outage is nothing, not an error.
 */
import { useEffect, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { fetchFountainItem, type FountainItem } from "@/lib/fountain";
import { fountainLinksOf } from "@/components/search/PanelMedia";
import { useRecentByKinds } from "@/hooks/useRecentByKinds";

type State = { items: FountainItem[]; loading: boolean };
const IDLE: State = { items: [], loading: false };
/** How many of a person's Fountain links become rows. */
const MAX_ITEMS = 12;

export function usePersonFountain(pubkey: string | null): State {
  const notes = useRecentByKinds(pubkey, [1], 40);
  // The links once the notes are in: a list that grows per arriving note would re-ask Fountain each time.
  const linksKey = notes.settled
    ? fountainLinksOf(notes.events as NostrEvent[])
        .slice(0, MAX_ITEMS)
        .map((l) => l.url)
        .join("\n")
    : null;
  const [state, setState] = useState<State & { key: string | null }>({ ...IDLE, key: null });
  useEffect(() => {
    if (!pubkey || linksKey === null) return;
    let alive = true;
    void Promise.all(
      (linksKey ? linksKey.split("\n") : []).map((url) => fetchFountainItem(url).catch(() => null)),
    ).then((found) => {
      const seen = new Set<string>();
      const items = found.filter((i): i is FountainItem => !!i && !seen.has(i.id) && (seen.add(i.id), true));
      if (alive) setState({ items, loading: false, key: linksKey });
    });
    return () => {
      alive = false;
    };
  }, [pubkey, linksKey]);
  if (!pubkey) return IDLE;
  return state.key === linksKey && linksKey !== null ? state : { items: [], loading: true };
}
