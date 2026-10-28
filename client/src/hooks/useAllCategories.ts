import { useEffect, useMemo, useState } from "react";
import { byResults, kindCategories, listCategory, type Category } from "@/lib/allCategories";
import type { RibbonList } from "@/hooks/useListRibbon";
import { countCategories, type SearchHit, type SearchPov } from "@/services/search";

/** How long new categories wait for others before they are counted together. */
const COUNT_AFTER_MS = 300;
/** How many searches' categories this visit remembers, so Back and a category's page keep the row. */
const REMEMBERED = 20;

interface Found {
  categories: Map<string, Category>;
  counts: Map<string, number | null>;
  /** Asked to count, answered or not. */
  asked: Set<string>;
}

const remembered = new Map<string, Found>();

/** Test seam: forget every search's categories. */
export const __forgetAllCategories = () => remembered.clear();

function foundFor(key: string): Found {
  let found = remembered.get(key);
  if (!found) {
    found = { categories: new Map(), counts: new Map(), asked: new Set() };
    remembered.set(key, found);
    if (remembered.size > REMEMBERED) remembered.delete(remembered.keys().next().value!);
  }
  return found;
}

export interface AllCategories {
  /** The counted ones, most results first: the tab row's. */
  shown: Category[];
  /** Every one found for the words, counted or not: a category the link names opens by its key. */
  known: ReadonlyMap<string, Category>;
}

/**
 * All's categories for the words, for its tab row: the kinds among All's rows (`page`, while All
 * shows its own) and the Dictionary's lists the words find items on (`lists`, hooks/useListRibbon),
 * each counted as its own page would ask it (services/search `countCategories`), most first
 * (lib/allCategories). A category shows once it is counted, so the row changes when the counts
 * land, not a category at a time as rows arrive.
 *
 * What a search has found is kept for the visit and only grows: on a category's page All's rows
 * are that category's, and the row still holds the rest.
 */
export function useAllCategories(
  query: string,
  {
    pov,
    userPubkey,
    enabled,
    page,
    lists,
  }: {
    pov: SearchPov;
    userPubkey?: string;
    enabled: boolean;
    page: readonly SearchHit[];
    lists: readonly RibbonList[];
  },
): AllCategories {
  const key = `${pov === "mywot" && userPubkey ? userPubkey : "house"}|${query}`;
  const found = useMemo(() => (enabled && query.trim() ? foundFor(key) : null), [enabled, query, key]);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  // A list item a list holds is its list's, not one more kind.
  useEffect(() => {
    if (!found) return;
    const held = new Set(lists.flatMap((l) => l.hits.map((h) => h.event.id)));
    let added = false;
    for (const c of [...lists.map(listCategory), ...kindCategories(page, held)]) {
      if (found.categories.has(c.key)) continue;
      found.categories.set(c.key, c);
      added = true;
    }
    if (added) bump();
  }, [found, page, lists]);

  // What isn't counted yet, counted together. A count on its way finishes when more arrive; leaving
  // the words cuts it off, and what it hadn't answered is asked again on coming back.
  const [counting] = useState(() => new Set<{ cancel: () => void; keys: string[] }>());
  useEffect(() => {
    if (!found) return;
    return () => {
      counting.forEach(({ cancel, keys }) => {
        cancel();
        keys.forEach((k) => found.asked.delete(k));
      });
      counting.clear();
    };
  }, [found, counting]);
  useEffect(() => {
    if (!found) return;
    const timer = setTimeout(() => {
      const uncounted = [...found.categories.values()].filter((c) => !found.asked.has(c.key));
      if (!uncounted.length) return;
      uncounted.forEach((c) => found.asked.add(c.key));
      const ask = { keys: uncounted.map((c) => c.key), cancel: () => {} };
      counting.add(ask);
      ask.cancel = countCategories(query, uncounted, { pov, userPubkey }, (counts) => {
        counting.delete(ask);
        counts.forEach((n, k) => found.counts.set(k, n));
        bump();
      });
    }, COUNT_AFTER_MS);
    return () => clearTimeout(timer);
    // `version` says the categories grew; `found` names the words and the lens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, version]);

  return useMemo(() => {
    if (!found) return { shown: [], known: new Map() };
    const counted = [...found.categories.values()].filter((c) => found.counts.has(c.key));
    return { shown: byResults(counted, found.counts), known: new Map(found.categories) };
    // `version` says what `found` holds has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, version]);
}
