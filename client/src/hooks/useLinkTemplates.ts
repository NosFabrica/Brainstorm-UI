import { useQuery } from "@tanstack/react-query";
import { DISPLAY_HINTS_ENABLED } from "@/config/dictionary";
import { fetchAvailableTemplates, fetchTemplates } from "@/services/linkTemplates";
import { useDictionaryReader } from "@/hooks/useDictionaryReader";
import type { LinkRef } from "@/lib/linkTemplates";

/** The templates a definition's links pin (services/linkTemplates). Off with the provisional flag. */
export function useLinkTemplates(refs: LinkRef[]) {
  // Only what fetching needs — each pinned id and where to look — in a stable
  // order: the same pins from any header are one cache entry, whatever they bind.
  const pins = [...new Map(refs.map((r) => [`${r.templateId} ${r.relay}`, r])).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, r]) => ({ templateId: r.templateId, relay: r.relay }));
  return useQuery({
    queryKey: ["link-templates", pins],
    queryFn: () => fetchTemplates(pins),
    enabled: DISPLAY_HINTS_ENABLED && pins.length > 0,
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
    enabled: DISPLAY_HINTS_ENABLED && enabled && settled,
    staleTime: 5 * 60_000,
  });
}
