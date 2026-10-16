import { useQuery } from "@tanstack/react-query";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { dictionaryConceptOf } from "@/services/dictionary";
import { resolveConceptBatched } from "@/services/conceptBatch";
import type { ResolvedConcept } from "@/lib/conceptResolution";

/**
 * The governing definition of an item's concept, for whoever is reading
 * (lib/conceptResolution): their own copy, their Assistant's, Brainstorm's,
 * else the community's. Anonymous readers skip straight to Brainstorm's.
 * `data` is null when the concept couldn't be resolved at all.
 */
export function useItemConcept(item: { kind: number; tags: string[][] }) {
  const { rendered } = useDictionaryConcepts();
  const community = dictionaryConceptOf(item, rendered);
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  return useQuery({
    queryKey: ["item-concept", community, pubkey, taPubkey],
    // Batched with every other concept this render asks for (services/conceptBatch).
    queryFn: (): Promise<ResolvedConcept | null> => resolveConceptBatched({ pubkey, taPubkey }, community!),
    enabled: !!community && settled,
    staleTime: 5 * 60_000,
  });
}
