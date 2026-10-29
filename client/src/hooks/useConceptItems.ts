import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listHeaders,
  loadConceptItems,
  loadListItems,
  searchListItems,
  type DictionaryEntry,
  type DictionaryItem,
} from "@/services/dictionary";

const STALE_MS = 5 * 60_000;

/**
 * A Dictionary concept's items (services/dictionary `loadConceptItems`),
 * read only when something shows them: an entry page, or a row once it nears
 * the screen. Keyed by the headers the list is filed under, so the row and
 * the entry share one read. The first relay's items show the moment they
 * land — a heavy list (books, 1–2 MB) needn't wait for the slower relay —
 * and the merged list replaces them; a list already on screen is never
 * swapped for a partial one.
 */
export function useConceptItems(entry: DictionaryEntry | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const headers = entry ? listHeaders(entry.communityCoordinate, entry.resolved) : [];
  return useQuery({
    queryKey: ["concept-items", ...headers],
    queryFn: () =>
      loadConceptItems(headers, undefined, (first) =>
        queryClient.setQueryData<DictionaryItem[]>(["concept-items", ...headers], (held) => held ?? first),
      ),
    enabled: enabled && headers.length > 0,
    staleTime: STALE_MS,
  });
}

/**
 * A Dictionary concept's items that have these words, from the whole list (services/dictionary
 * `searchListItems`): what a page's own read, which stops at its first 500, can miss.
 */
export function useConceptMatches(entry: DictionaryEntry | undefined, words: readonly string[], enabled = true) {
  const headers = entry ? listHeaders(entry.communityCoordinate, entry.resolved) : [];
  return useQuery({
    queryKey: ["concept-matches", words.join(" "), ...headers],
    queryFn: () => searchListItems(headers, words),
    enabled: enabled && headers.length > 0 && words.length > 0,
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
