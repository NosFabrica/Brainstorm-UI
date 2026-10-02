import { useQuery } from "@tanstack/react-query";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasSession } from "@/hooks/useHasSession";
import { useSelfHistory } from "@/hooks/useSelf";
import { dictionaryConceptOf, loadDictionary } from "@/services/dictionary";
import type { ResolvedConcept } from "@/lib/conceptResolution";

/**
 * The governing definition of an item's concept, for whoever is reading
 * (lib/conceptResolution): their own copy, their Assistant's, Brainstorm's,
 * else the community's. Anonymous readers skip straight to Brainstorm's.
 * `data` is null when the concept couldn't be resolved at all.
 */
export function useItemConcept(item: { kind: number; tags: string[][] }) {
  const community = dictionaryConceptOf(item);
  const hasSession = useHasSession();
  const pubkey = useActiveAccountDisplay()?.pubkey ?? null;
  // /user/history is auth-only; without a Session it is never asked, and the reader has no Assistant to look for.
  const history = useSelfHistory(hasSession ? (pubkey ?? undefined) : undefined);
  const taPubkey = (history.data as { data?: { ta_pubkey?: string | null } } | undefined)?.data?.ta_pubkey ?? null;
  const historySettled = !(history.isPending && history.fetchStatus !== "idle");
  return useQuery({
    queryKey: ["item-concept", community, pubkey, taPubkey],
    queryFn: async (): Promise<ResolvedConcept | null> => {
      const [entry] = await loadDictionary({ pubkey, taPubkey }, [community!], undefined, { items: false });
      return entry?.resolved ?? null;
    },
    enabled: !!community && historySettled,
    staleTime: 5 * 60_000,
  });
}
