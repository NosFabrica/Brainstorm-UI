import { useContext, useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { dictionaryRelays } from "@/config/dictionary";
import { useDictionary } from "@/hooks/useDictionary";
import { PresentationOverrideContext } from "@/hooks/useItemView";
import { presentItem } from "@/lib/itemPresentation";
import { matchListItems, namesListOnly, wordsToFind } from "@/lib/listSearch";
import { queryWords } from "@/lib/searchSyntax";
import { eventPath } from "@/lib/shareId";
import { filedItems, itemIdentity, listHeaders, type DictionaryItem } from "@/services/dictionary";
import { searchListItems, type ListAnswer, type SearchHit, type SearchPov } from "@/services/search";

/** One list on the ribbon: a Dictionary list the words find items on, or with items on All's page. */
export interface RibbonList {
  /** Its community coordinate: a kind with a page of its own (hooks/useListKinds) is matched by it. */
  coordinate: string;
  name: string;
  image: string | null;
  /** Its items the words find, best first, then its others on All's page, as the All tab's rows take them. */
  hits: SearchHit[];
  /** The relay stopped at its cap for this list: more than these may match. */
  more: boolean;
  /** The list's own page. */
  href: string;
}

/** The most items asked of each list. */
const LIMIT = 50;

/** The relay's answers this visit, by ask, so coming back to a search paints its lists at once. */
const answeredBefore = new Map<string, Map<string, ListAnswer>>();
const REMEMBERED = 20;

/** Test seam: forget the relay's answers. */
export const __resetListRibbon = () => answeredBefore.clear();

/**
 * The lists over the All tab's results: every list the Dictionary shows that
 * the words find items on, with those items. All's own answer holds every
 * kind at once, so a list's few items sink under the rest; this asks the
 * search relay of the lists alone, through the search's lens
 * (services/search `searchListItems`), and keeps the whole-word matches of
 * what each list's cards show (lib/listSearch), a view's own reading included.
 * A list item on All's own page (`page`, the rows it shows) counts too, however
 * loosely the relay matched it: an item the reader can see has its list on the
 * ribbon. So a count is of what was found so far, not of all that matches.
 * A search that is a list's name alone ("books") has that list, with its
 * items whatever their words, first; then the most found first.
 *
 * For everyone, signed in or not, as the Top page's list results are: a
 * reader with no copy reads Brainstorm's definitions (ADR 0004).
 *
 * `settled` once the Dictionary and the relay have answered: until then a
 * list missing from `lists` may yet come.
 */
export function useListRibbon(
  query: string,
  {
    pov,
    userPubkey,
    enabled,
    page,
  }: { pov: SearchPov; userPubkey?: string; enabled: boolean; page: readonly SearchHit[] },
): { lists: RibbonList[]; settled: boolean } {
  const dictionary = useDictionary(enabled, { anonymous: true });
  const lists = useMemo(() => (dictionary.data ?? []).filter((e) => e.resolved), [dictionary.data]);
  const words = queryWords(query).trim();
  const asks = useMemo(
    () =>
      lists.map((e) => ({
        key: e.communityCoordinate,
        headers: listHeaders(e.communityCoordinate, e.resolved),
        whole: namesListOnly(words, e.resolved!.governing),
      })),
    [lists, words],
  );
  const ask =
    enabled && words && asks.length
      ? [
          pov,
          userPubkey ?? "",
          query,
          ...asks.map((a) => `${a.key}${a.whole ? " whole" : ""}=${a.headers.join(",")}`),
        ].join("\n")
      : null;

  const [answered, setAnswered] = useState<{ ask: string; answers: Map<string, ListAnswer> } | null>(() => {
    const answers = ask ? answeredBefore.get(ask) : undefined;
    return ask && answers ? { ask, answers } : null;
  });
  useEffect(() => {
    if (!ask) return;
    const before = answeredBefore.get(ask);
    if (before) {
      setAnswered((a) => (a?.ask === ask ? a : { ask, answers: before }));
      return;
    }
    let alive = true;
    void searchListItems(query, asks, { pov, userPubkey, limit: LIMIT }).then((answers) => {
      answeredBefore.set(ask, answers);
      if (answeredBefore.size > REMEMBERED) answeredBefore.delete(answeredBefore.keys().next().value!);
      if (alive) setAnswered({ ask, answers });
    });
    return () => {
      alive = false;
    };
    // `ask` names the query, the lens and the lists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const override = useContext(PresentationOverrideContext);
  const onPage = useMemo(() => page.map((h) => h.event) as DictionaryItem[], [page]);
  const ribbon = useMemo(() => {
    if (!enabled) return [];
    const answers = ask && answered?.ask === ask ? answered.answers : null;
    const found: RibbonList[] = [];
    const named = new Set<string>();
    for (const entry of lists) {
      const resolved = entry.resolved!;
      const definition = resolved.governing;
      const headers = listHeaders(entry.communityCoordinate, resolved);
      const answer = answers?.get(entry.communityCoordinate);
      const toFind = wordsToFind(words, definition);
      const read = (item: { tags: string[][] }) => {
        const shown = presentItem(item, definition);
        return override ? override(item, resolved, shown) : shown;
      };
      const whole = namesListOnly(words, definition);
      if (whole) named.add(entry.communityCoordinate);
      const filed = answer ? filedItems(answer.events as DictionaryItem[], headers) : [];
      const matched = whole ? filed : toFind.length ? matchListItems(filed, definition, toFind, Infinity, read) : [];
      const held = new Set(matched.map(itemIdentity));
      const items = [...matched, ...filedItems(onPage, headers).filter((item) => !held.has(itemIdentity(item)))];
      if (!items.length) continue;
      found.push({
        coordinate: entry.communityCoordinate,
        name: definition.plural,
        image: definition.display.listImage,
        hits: items.map((item) => ({ event: item as NostrEvent, author: null, rank: null })),
        more: answer?.full ?? false,
        href: eventPath(resolved.community?.event ?? definition.event, dictionaryRelays()),
      });
    }
    return found.sort(
      (a, b) =>
        Number(named.has(b.coordinate)) - Number(named.has(a.coordinate)) ||
        b.hits.length - a.hits.length ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [enabled, ask, answered, lists, words, override, onPage]);
  const settled =
    !enabled || ((dictionary.data !== undefined || dictionary.isError) && (!ask || answered?.ask === ask));
  return { lists: ribbon, settled };
}
