import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { SearchSnapshot } from "@/services/search";

/**
 * Whether the search's own results have answered (people, notes): on the Top page, what a preview
 * asks only to order its rows — who recommends each thing, its stars — waits until they have, so it
 * never queues in front of them at the relay (measured 2026-10-21: People ~1.5 s later without it).
 * True everywhere else: a page with no search to wait on asks at once.
 */
export const SearchPriorityContext = createContext<boolean>(true);

/** True once the search's own results have answered, or where there's no search to wait on. */
export function useSearchPriority(): boolean {
  return useContext(SearchPriorityContext);
}

/** How long the lookups wait on a people section that hasn't answered: never longer than this. */
const MAX_WAIT_MS = 4000;

/**
 * The value SearchPriorityContext carries on the results page: on the Top page (`top`), false until
 * the people section has answered — results, or an error — or MAX_WAIT_MS have passed, afresh for
 * each `query`; off it, true.
 */
export function useSearchPriorityState(top: boolean, people: SearchSnapshot | null, query: string): boolean {
  const [waitedOut, setWaitedOut] = useState<string | null>(null);
  // A new search keeps the last one's people on the page until its own arrive: whatever answer was
  // there when the words changed is the last search's, not this one's.
  const seen = useRef<{ query: string; stale: SearchSnapshot | null }>({ query, stale: null });
  if (seen.current.query !== query) seen.current = { query, stale: people };
  useEffect(() => {
    if (!top) return;
    const timer = window.setTimeout(() => setWaitedOut(query), MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [top, query]);
  if (!top) return true;
  if (people && people !== seen.current.stale && (people.eose || people.error)) return true;
  return waitedOut === query;
}
