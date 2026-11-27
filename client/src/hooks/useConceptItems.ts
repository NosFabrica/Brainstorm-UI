import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { capMap } from "@/lib/boundedMap";
import {
  filedItems,
  itemFilters,
  listHeaders,
  loadConceptItems,
  loadListItems,
  searchListItems,
  type DictionaryEntry,
  type DictionaryItem,
  type ListItems,
} from "@/services/dictionary";

/** A list's items are asked again at most this often, the stale time they had as a query. */
const WINDOW = { minMs: 5 * 60_000 };

/**
 * The items filed under these headers (services/dictionary `filedItems`),
 * from the EventStore while `ask` reads them into it (docs/adr/0005): each
 * relay's items show as they land — a heavy list (books, 1–2 MB) needn't wait
 * for the slower relay — and only ever add up, so a list on screen is never
 * swapped for a partial one. `data` is undefined until there is something to
 * show, or the ask has settled with nothing.
 */
function useFiledItems(prefix: string, headers: string[], enabled: boolean, ask: () => Promise<unknown>) {
  const headersKey = headers.join(" ");
  const asking = enabled && headers.length > 0;
  const key = asking ? `${prefix}:${headersKey}` : null;
  // `headersKey` is `headers`, as a value.
  const filters = useMemo(() => (asking ? itemFilters(headers) : null), [asking, headersKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = useStoreEvents(key, filters, ask, WINDOW);
  const items = useMemo(
    () => filedItems(read.events as DictionaryItem[], headers),
    [read.events, headersKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const data = asking && (read.settled || items.length > 0) ? items : undefined;
  return { data, isPending: data === undefined, settled: read.settled };
}

/**
 * A Dictionary concept's items (services/dictionary `loadConceptItems`),
 * read only when something shows them: an entry page, or a row once it nears
 * the screen. Keyed by the headers the list is filed under, so the row and
 * the entry share one read.
 */
export function useConceptItems(entry: DictionaryEntry | undefined, enabled = true) {
  const headers = entry ? listHeaders(entry.communityCoordinate, entry.resolved) : [];
  const read = useFiledItems("concept-items", headers, enabled, () => loadConceptItems(headers));
  return { data: read.data, isPending: read.isPending, settled: read.settled };
}

/**
 * A Dictionary concept's items that have these words, from the whole list (services/dictionary
 * `searchListItems`): what a page's own read, which stops at its first 500, can miss. The search
 * relay matches the words, which no store filter can, so these are the ask's own events, held as
 * the store keeps them (hooks/useStoreEvents).
 */
export function useConceptMatches(entry: DictionaryEntry | undefined, words: readonly string[], enabled = true) {
  const headers = entry ? listHeaders(entry.communityCoordinate, entry.resolved) : [];
  const headersKey = headers.join(" ");
  const asking = enabled && headers.length > 0 && words.length > 0;
  const read = useStoreEvents(
    asking ? `concept-matches:${words.join(" ")}:${headersKey}` : null,
    null,
    () => searchListItems(headers, words),
    WINDOW,
  );
  const items = useMemo(
    () => filedItems(read.events as DictionaryItem[], headers),
    [read.events, headersKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const data = asking && read.settled ? items : undefined;
  return { data, isPending: data === undefined };
}

/**
 * Per read, whether its answer reached the read's limit: a fact about the ask's answer, not about
 * the store. Kept beside the asks, as hooks/useListItems keeps its flags, so a mount within the
 * window, served without the read running again, still knows.
 */
const truncatedReads = new Map<string, boolean>();
const MAX_READS = 500;

/** Any list's items by the headers it's filed under, and whether the read was cut off (a list header's page). */
export function useListItems(headers: string[]): { data: ListItems | undefined; isPending: boolean } {
  const key = `list-items:${headers.join(" ")}`;
  const read = useFiledItems("list-items", headers, true, async () => {
    const answer = await loadListItems(headers);
    truncatedReads.set(key, answer.truncated);
    capMap(truncatedReads, MAX_READS);
    // The items themselves are the answer: the store holds them, and useStoreEvents keeps any it has let go.
    return answer.items;
  });
  const truncated = read.settled && truncatedReads.get(key) === true;
  const data = useMemo(() => read.data && { items: read.data, truncated }, [read.data, truncated]);
  return { data, isPending: read.isPending };
}
