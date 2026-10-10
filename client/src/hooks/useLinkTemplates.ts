import { useQuery } from "@tanstack/react-query";
import { fetchAvailableTemplates, fetchTemplates } from "@/services/linkTemplates";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import type { LinkRef } from "@/lib/linkTemplates";

/** The templates a definition's links pin (services/linkTemplates). */
export function useLinkTemplates(refs: LinkRef[]) {
  const ids = [...new Set(refs.map((r) => r.templateId))].sort();
  // The ids are what `refs` asks for: a new array naming the same templates is the same question.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  return useQuery({
    queryKey: ["link-templates", ids.join(",")],
    queryFn: () => fetchTemplates(refs),
    enabled: ids.length > 0,
    // An id names one frozen event: nothing to refresh.
    staleTime: Infinity,
  });
}

/** The URL templates the link picker offers: the reader's governing URL Templates list. */
export function useAvailableTemplates(enabled = true) {
  const { pubkey, taPubkey, settled } = useDictionaryReader();
  return useQuery({
    queryKey: ["link-templates", "available", pubkey, taPubkey],
    queryFn: () => fetchAvailableTemplates({ pubkey, taPubkey }),
    enabled: enabled && settled,
    staleTime: 5 * 60_000,
  });
}
