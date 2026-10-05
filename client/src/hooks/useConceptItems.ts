import { useQuery } from "@tanstack/react-query";
import { listHeaders, loadConceptItems, type DictionaryEntry } from "@/services/dictionary";

/**
 * A Dictionary concept's items (services/dictionary `loadConceptItems`),
 * read only when something shows them: an entry page, or a row once it nears
 * the screen. Keyed by the headers the list is filed under, so the row and
 * the entry share one read.
 */
export function useConceptItems(entry: DictionaryEntry | undefined, enabled = true) {
  const headers = entry ? listHeaders(entry.communityCoordinate, entry.resolved) : [];
  return useQuery({
    queryKey: ["concept-items", ...headers],
    queryFn: () => loadConceptItems(headers),
    enabled: enabled && headers.length > 0,
    staleTime: 5 * 60_000,
  });
}
