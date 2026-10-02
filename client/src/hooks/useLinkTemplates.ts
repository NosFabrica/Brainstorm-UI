import { useQuery } from "@tanstack/react-query";
import { DISPLAY_HINTS_ENABLED } from "@/config/dictionary";
import { fetchAvailableTemplates, fetchTemplates } from "@/services/linkTemplates";
import type { LinkRef } from "@/lib/linkTemplates";

/** The templates a definition's links pin (services/linkTemplates). Off with the provisional flag. */
export function useLinkTemplates(refs: LinkRef[]) {
  const ids = [...new Set(refs.map((r) => r.templateId))].sort();
  return useQuery({
    queryKey: ["link-templates", ids.join(",")],
    queryFn: () => fetchTemplates(refs),
    enabled: DISPLAY_HINTS_ENABLED && ids.length > 0,
    // An id names one frozen event: nothing to refresh.
    staleTime: Infinity,
  });
}

/** The URL Templates the version tester offers. */
export function useAvailableTemplates(enabled = true) {
  return useQuery({
    queryKey: ["link-templates", "available"],
    queryFn: fetchAvailableTemplates,
    enabled: DISPLAY_HINTS_ENABLED && enabled,
    staleTime: 5 * 60_000,
  });
}
