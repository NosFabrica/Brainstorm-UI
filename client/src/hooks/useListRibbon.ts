import { useContext, useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { useDictionary } from "@/hooks/useDictionary";
import { PresentationOverrideContext } from "@/hooks/useItemView";
import { presentItem } from "@/lib/itemPresentation";
import { matchListItems, wordsToFind } from "@/lib/listSearch";
import { queryWords } from "@/lib/searchSyntax";
import { eventPath } from "@/lib/shareId";
import { filedItems, listHeaders, type DictionaryItem } from "@/services/dictionary";
import { searchListItems, type ListAnswer, type SearchHit, type SearchPov } from "@/services/search";

/** One list on the ribbon: a Dictionary list the words find items on. */
export interface RibbonList {
  /** Its community coordinate: a kind with a page of its own (hooks/useListKinds) is matched by it. */
  coordinate: string;
  name: string;
  image: string | null;
  /** Its items the words find, best first, as the All tab's rows take them. */
  hits: SearchHit[];
  /** The relay stopped at its cap for this list: more than these may match. */
  more: boolean;
  /** The list's own page. */
  href: string;
}

/** The most items asked of each list. */
const LIMIT = 50;

/**
 * The lists over the All tab's results: every list the Dictionary shows that
 * the words find items on, with those items. All's own answer holds every
 * kind at once, so a list's few items sink under the rest; this asks the
 * search relay of the lists alone, through the search's lens
 * (services/search `searchListItems`), and keeps the whole-word matches of
 * what each list's cards show (lib/listSearch), a view's own reading included.
 * Most matches first.
 *
 * For everyone, signed in or not, as the Top page's list results are: a
 * reader with no copy reads Brainstorm's definitions (ADR 0004).
 */
export function useListRibbon(
  query: string,
  { pov, userPubkey, enabled }: { pov: SearchPov; userPubkey?: string; enabled: boolean },
): RibbonList[] {
  const dictionary = useDictionary(enabled, { anonymous: true });
  const lists = useMemo(() => (dictionary.data ?? []).filter((e) => e.resolved), [dictionary.data]);
  const asks = useMemo(
    () => lists.map((e) => ({ key: e.communityCoordinate, headers: listHeaders(e.communityCoordinate, e.resolved) })),
    [lists],
  );
  const words = queryWords(query).trim();
  const ask =
    enabled && words && asks.length
      ? [pov, userPubkey ?? "", query, ...asks.map((a) => `${a.key}=${a.headers.join(",")}`)].join("\n")
      : null;

  const [answered, setAnswered] = useState<{ ask: string; answers: Map<string, ListAnswer> } | null>(null);
  useEffect(() => {
    if (!ask) return;
    let alive = true;
    void searchListItems(query, asks, { pov, userPubkey, limit: LIMIT }).then(
      (answers) => alive && setAnswered({ ask, answers }),
    );
    return () => {
      alive = false;
    };
    // `ask` names the query, the lens and the lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const override = useContext(PresentationOverrideContext);
  return useMemo(() => {
    if (!ask || answered?.ask !== ask) return [];
    const found: RibbonList[] = [];
    for (const entry of lists) {
      const resolved = entry.resolved!;
      const definition = resolved.governing;
      const events = answered.answers.get(entry.communityCoordinate)?.events ?? [];
      const toFind = wordsToFind(words, definition);
      if (!events.length || !toFind.length) continue;
      const read = (item: { tags: string[][] }) => {
        const shown = presentItem(item, definition);
        return override ? override(item, resolved, shown) : shown;
      };
      const items = filedItems(events as DictionaryItem[], listHeaders(entry.communityCoordinate, resolved));
      const matched = matchListItems(items, definition, toFind, Infinity, read);
      if (!matched.length) continue;
      found.push({
        coordinate: entry.communityCoordinate,
        name: definition.plural,
        image: definition.display.listImage,
        hits: matched.map((item) => ({ event: item as NostrEvent, author: null, rank: null })),
        more: answered.answers.get(entry.communityCoordinate)!.full,
        href: eventPath(resolved.community?.event ?? definition.event, dictionaryRelays()),
      });
    }
    return found.sort(
      (a, b) => b.hits.length - a.hits.length || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [ask, answered, lists, words, override]);
}
