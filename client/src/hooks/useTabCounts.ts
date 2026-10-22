import { useEffect, useRef, useState } from "react";
import { queryWords } from "@/lib/searchSyntax";
import type { TabCounts } from "@/lib/tabCounts";
import { countTabs, type SearchPov, type SearchTab } from "@/services/search";
import { fetchSearchTags } from "@/services/searchTags";

/** How long the counts wait on results that haven't answered: never longer than this. */
const MAX_WAIT_MS = 4000;
/** How many searches' counts this session remembers, so Back from a result asks nothing again. */
const REMEMBERED = 30;

export interface TabCountsState {
  counts: TabCounts;
  /** Whether the words name a tag — asked only once People is known to hold no one. */
  tagNamed?: boolean;
}

const NOTHING_KNOWN: TabCountsState = { counts: {} };
const remembered = new Map<string, TabCountsState>();

/** Test seam: forget every search's counts. */
export function __forgetTabCounts(): void {
  remembered.clear();
}

function remember(key: string, value: TabCountsState): void {
  remembered.delete(key);
  remembered.set(key, value);
  if (remembered.size > REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

/**
 * How many results each tab holds for the words on the page (services/search's countTabs), asked
 * once the page's own results have answered (`ready`) or MAX_WAIT_MS have passed, so the counts
 * never stand in front of them; once asked, a change of tab doesn't ask again.
 *
 * Nothing is known until every count is in — or has timed out, which countTabs bounds — and, when
 * People holds no one, until the tag answer is in too: the row changes once, not a tab at a time
 * as the answers land. Per query and lens, remembered for the session, so coming back from a
 * result shows the settled row at once. A query of filters alone (`sort:`, a date range) asks
 * nothing: with no words or scope to narrow it, a count runs over a whole kind, a heavy ask for little.
 */
export function useTabCounts(
  query: string,
  tabs: readonly SearchTab[],
  { pov, userPubkey, ready }: { pov: SearchPov; userPubkey?: string; ready: boolean },
): TabCountsState {
  const words = queryWords(query);
  // The viewer's own lens only when they chose it and are signed in, else the house (as search does).
  const mine = pov === "mywot" && !!userPubkey;
  const key = `${mine ? userPubkey : "house"}|${query}|${tabs.join(",")}`;
  const [settled, setSettled] = useState<{ key: string; value: TabCountsState } | null>(null);
  const [waitedOut, setWaitedOut] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  const known = remembered.get(key);
  const asking = !!words && !known && (asked.current === key || ready || waitedOut === key);

  useEffect(() => {
    if (!words || ready || known) return;
    const timer = window.setTimeout(() => setWaitedOut(key), MAX_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [words, ready, known, key]);

  useEffect(() => {
    if (!asking) return;
    asked.current = key;
    let current = true;
    const lens = mine ? { pov: "mywot" as const, userPubkey } : { pov: "nosfabrica" as const };
    const counts: TabCounts = {};
    let tagNamed: boolean | undefined;
    const settle = () => {
      if (!current || tabs.some((tab) => counts[tab] === undefined)) return;
      if (counts.people === 0 && tagNamed === undefined) return;
      const value = { counts, tagNamed };
      remember(key, value);
      setSettled({ key, value });
    };
    const cancel = countTabs(query, tabs, lens, (tab, count) => {
      if (!current) return;
      counts[tab] = count;
      // People may still lead with the people on a tag the words name: asked only when the relay's
      // own people answer is none, the one case it decides — in the form the Top page and the People
      // tab ask it, so their answer is the one this reads.
      if (tab === "people" && count === 0) {
        void fetchSearchTags(words, lens, { members: true }).then((found) => {
          tagNamed = found.length > 0;
          settle();
        });
      }
      settle();
    });
    return () => {
      current = false;
      cancel();
    };
    // `key` is the question: the words, the lens and the tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asking, key]);

  if (known) return known;
  return settled?.key === key ? settled.value : NOTHING_KNOWN;
}
