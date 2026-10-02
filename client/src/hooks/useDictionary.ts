import { useQuery } from "@tanstack/react-query";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useSelfHistory } from "@/hooks/useSelf";
import { loadDictionary } from "@/services/dictionary";

/**
 * The Active Account's Dictionary (services/dictionary). Waits for
 * `/user/history` to say who their Assistant is — reading without it would
 * show "not in your Dictionary" for a concept their Assistant did add, then
 * flip. With no Session the history never comes, so it reads with the
 * account alone.
 */
export function useDictionary() {
  const pubkey = useActiveAccountDisplay()?.pubkey ?? null;
  const history = useSelfHistory(pubkey ?? undefined);
  const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey ?? null;
  const historySettled = !(history.isPending && history.fetchStatus !== "idle");
  const query = useQuery({
    queryKey: ["dictionary", pubkey, taPubkey],
    // Headers and copies only: a concept's items load when its row or entry shows them (useConceptItems).
    queryFn: () => loadDictionary({ pubkey, taPubkey }, undefined, undefined, { items: false }),
    enabled: !!pubkey && historySettled,
    staleTime: 5 * 60_000,
  });
  return { ...query, pubkey, taPubkey };
}
