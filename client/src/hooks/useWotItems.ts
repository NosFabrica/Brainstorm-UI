import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { fetchAuthorRanks, inWebOfTrust, type AuthorRanks, type RankObserver } from "@/services/wotRanks";

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
 * (services/wotRanks). While ranks load, nothing is in it yet — `pending`
 * says so, so a list shows "checking" rather than an empty verdict.
 */
export function useWotItems<T extends { pubkey: string }>(items: T[]) {
  const observer = useRankObserver();
  const authors = useMemo(() => [...new Set(items.map((i) => i.pubkey))].sort(), [items]);
  const ranks = useQuery({
    queryKey: ["author-ranks", observer, authors.join(",")],
    queryFn: (): Promise<AuthorRanks> => fetchAuthorRanks(authors, observer),
    enabled: authors.length > 0,
    staleTime: 10 * 60_000,
  });
  return useMemo(() => {
    const map = ranks.data?.ranks ?? new Map<string, number>();
    const trusted = items.filter((i) => inWebOfTrust(map, i.pubkey));
    return {
      trusted,
      outside: items.filter((i) => !inWebOfTrust(map, i.pubkey)),
      pending: authors.length > 0 && ranks.isPending,
      /** Whose scorer answered; "house" under My perspective means the reader has none yet. */
      source: ranks.data?.source ?? null,
      observer,
    };
  }, [items, ranks.data, ranks.isPending, authors.length, observer]);
}
