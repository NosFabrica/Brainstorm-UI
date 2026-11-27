import { useMemo } from "react";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { useDictionaryEntries } from "@/hooks/useDictionaryEntries";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import { dictionaryConceptOf } from "@/services/dictionary";
import { resolveConceptBatched } from "@/services/conceptBatch";
import type { ResolvedConcept } from "@/lib/conceptResolution";

/**
 * The governing definition of an item's concept, for whoever is reading
 * (lib/conceptResolution): their own copy, their Assistant's, Brainstorm's,
 * else the community's. Anonymous readers skip straight to Brainstorm's.
 * `data` is null when the concept couldn't be resolved at all, undefined
 * while it is being read.
 *
 * Decided from the headers in the EventStore (hooks/useDictionaryEntries),
 * which the ask fills through the page's concept batch (services/conceptBatch):
 * every concept a render asks for goes out as one read.
 */
export function useItemConcept(item: { kind: number; tags: string[][] }): {
  data: ResolvedConcept | null | undefined;
  isPending: boolean;
} {
  const { rendered } = useDictionaryConcepts();
  const community = dictionaryConceptOf(item, rendered);
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  const reader = useMemo(() => ({ pubkey, taPubkey }), [pubkey, taPubkey]);
  const concepts = useMemo(() => (community ? [community] : []), [community]);
  const read = useDictionaryEntries(reader, concepts, {
    enabled: !!community && settled,
    prefix: "item-concept",
    ask: () => resolveConceptBatched(reader, community!),
  });
  const data = read.entries && community ? (read.entries[0]?.resolved ?? null) : undefined;
  return { data, isPending: data === undefined };
}
