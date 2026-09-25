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
import { fetchRecentByKinds } from "@/services/nostr";

type State = { items: FountainItem[]; loading: boolean };
const IDLE: State = { items: [], loading: false };
/** How many of a person's Fountain links become rows. */
const MAX_ITEMS = 12;

export function usePersonFountain(pubkey: string | null): State {
  const [state, setState] = useState<State>(() => (pubkey ? { items: [], loading: true } : IDLE));
  useEffect(() => {
    if (!pubkey) {
      setState(IDLE);
      return;
    }
    let alive = true;
    setState({ items: [], loading: true });
    void (async () => {
      try {
        const notes = (await fetchRecentByKinds(pubkey, [1], 40)) as NostrEvent[];
        const links = fountainLinksOf(notes).slice(0, MAX_ITEMS);
        const found = await Promise.all(links.map(({ url }) => fetchFountainItem(url).catch(() => null)));
        const seen = new Set<string>();
        const items = found.filter((i): i is FountainItem => !!i && !seen.has(i.id) && (seen.add(i.id), true));
        if (alive) setState({ items, loading: false });
      } catch {
        if (alive) setState(IDLE);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pubkey]);
  return state;
}
