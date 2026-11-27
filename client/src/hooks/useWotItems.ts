import { useMemo } from "react";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useAuthorRanks } from "@/hooks/useLensRanks";
import { inWebOfTrust, type RankObserver } from "@/services/wotRanks";

/**
 * Whose Perspective ranks authors: the reader's own under My perspective,
 * else the house — the rule tags use (useTagObserver). Part of every rank
 * query key, so flipping the Perspective re-reads instead of showing the
 * other one's answer.
 */
export function useRankObserver(): RankObserver {
  const [pov] = useActivePerspective();
  const viewer = useActiveAccountDisplay()?.pubkey;
  return pov === "mywot" && viewer ? viewer : "house";
}

/**
 * Splits items by whether their author is in the reader's web of trust
 * (services/wotRanks). The ranks come from the store (hooks/useLensRanks
 * `useAuthorRanks`): the observer's 10040 first, then its scorer's ranks.
 * While they load, nothing is in it yet — `pending` says so, so a list shows
 * "checking" rather than an empty verdict.
 */
export function useWotItems<T extends { pubkey: string }>(items: T[]) {
  const observer = useRankObserver();
  const authors = useMemo(() => [...new Set(items.map((i) => i.pubkey))].sort(), [items]);
  const ranks = useAuthorRanks(authors, observer);
  return useMemo(() => {
    const trusted = items.filter((i) => inWebOfTrust(ranks.ranks, i.pubkey));
    return {
      trusted,
      outside: items.filter((i) => !inWebOfTrust(ranks.ranks, i.pubkey)),
      pending: ranks.pending,
      /** Whose scorer answered; "house" under My perspective means the reader has none yet. */
      source: ranks.source,
      observer,
    };
  }, [items, ranks.ranks, ranks.pending, ranks.source, observer]);
}
