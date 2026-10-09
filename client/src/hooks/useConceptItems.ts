import { useQuery } from "@tanstack/react-query";
import { listHeaders, loadConceptItems, loadListItems, type DictionaryEntry } from "@/services/dictionary";

const STALE_MS = 5 * 60_000;

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
    staleTime: STALE_MS,
  });
}

/** Any list's items by the headers it's filed under, and whether the read was cut off (a list header's page). */
export function useListItems(headers: string[]) {
  return useQuery({
    queryKey: ["list-items", ...headers],
    queryFn: () => loadListItems(headers),
    enabled: headers.length > 0,
    staleTime: STALE_MS,
  });
}
