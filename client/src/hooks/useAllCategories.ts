import { useEffect, useMemo, useState } from "react";
import { kindCategories, listCategory, rowOrder, standingCategories, type Category } from "@/lib/allCategories";
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
  /** Found among All's rows or the lists, not only standing: shown whatever its count says. */
  seen: Set<string>;
}

const remembered = new Map<string, Found>();

/** Test seam: forget every search's categories. */
export const __forgetAllCategories = () => remembered.clear();

function foundFor(key: string): Found {
  let found = remembered.get(key);
  if (!found) {
    found = {
      categories: new Map(standingCategories().map((c) => [c.key, c])),
      counts: new Map(),
      asked: new Set(),
      seen: new Set(),
    };
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
  /**
   * How many results a category's page holds, where its count says so: not a kind that shares
   * its kinds with another category (Articles and Recipes are both kind 30023, and each page
   * keeps its own label's rows, so neither count is its page's).
   */
  totals: ReadonlyMap<string, number>;
  /** Nothing counted yet for the words: the row says it is coming rather than filling as it lands. */
  loading: boolean;
}

function totalsOf(categories: readonly Category[], counts: ReadonlyMap<string, number | null>): Map<string, number> {
  // A list is told from the others by its headers, and its page keeps every row it is sent.
  const holders = new Map<number, number>();
  for (const c of categories) if (c.label) for (const k of c.kinds) holders.set(k, (holders.get(k) ?? 0) + 1);
  const totals = new Map<string, number>();
  for (const c of categories) {
    const n = counts.get(c.key);
    // A tab's ask is a union of filters, each counted to its page size: not a total.
    const own = !c.label || c.kinds.every((k) => holders.get(k) === 1);
    if (typeof n === "number" && !c.tab && own) totals.set(c.key, n);
  }
  return totals;
}

/**
 * All's categories for the words, for its tab row: the kinds among All's rows (`page`, while All
 * shows its own), the Dictionary's lists the words find items on (`lists`, hooks/useListRibbon),
 * and the kinds Top's tabs ask (lib/allCategories `standingCategories`) — those only when their
 * count finds some, so a kind deeper than All's first page still has its place. Each is counted as
 * its own page would ask it (services/search `countCategories`), and the row goes Notes, People,
 * the biggest list, then the rest by their results (`rowOrder`). A category shows once it is
 * counted, so the row changes when the counts land, not a category at a time as rows arrive.
 *
 * The first count waits for `ready` — All's first page and the lists' answer in — so the row comes
 * whole, once, instead of as each lands; until then it is `loading`. What a search has found is
 * kept for the visit and only grows: on a category's page All's rows are that category's, and the
 * row still holds the rest.
 */
export function useAllCategories(
  query: string,
  {
    pov,
    userPubkey,
    enabled,
    page,
    lists,
    ready,
  }: {
    pov: SearchPov;
    userPubkey?: string;
    enabled: boolean;
    page: readonly SearchHit[];
    lists: readonly RibbonList[];
    /** What the row is found from has answered: All's first page (or a category's), and the lists. */
    ready: boolean;
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
      if (!found.seen.has(c.key)) {
        found.seen.add(c.key);
        added = true;
      }
      if (!found.categories.has(c.key)) found.categories.set(c.key, c);
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
    if (!found || (!ready && found.asked.size === 0)) return;
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
  }, [found, version, ready]);

  return useMemo(() => {
    if (!found) return { shown: [], known: new Map(), totals: new Map(), loading: false };
    const all = [...found.categories.values()];
    // A standing category the page never showed stands only when its count finds some.
    const counted = all.filter(
      (c) => found.counts.has(c.key) && (found.seen.has(c.key) || (found.counts.get(c.key) ?? 0) > 0),
    );
    return {
      shown: rowOrder(counted, found.counts),
      known: new Map(found.categories),
      totals: totalsOf(all, found.counts),
      loading: found.counts.size === 0,
    };
    // `version` says what `found` holds has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, version]);
}

/**
 * A category by its key, when it is known before anything is read: one of the standing ones, or
 * one this visit found for the words — so a link to it opens on it, asking nothing of All first.
 */
export function knownCategory(
  query: string,
  key: string,
  { pov, userPubkey }: { pov: SearchPov; userPubkey?: string },
): Category | null {
  const found = remembered.get(`${pov === "mywot" && userPubkey ? userPubkey : "house"}|${query}`);
  return found?.categories.get(key) ?? standingCategories().find((c) => c.key === key) ?? null;
}
