/** The items of Dictionary lists that a search's words find (All's list categories). */
import type { NostrEvent } from "nostr-tools";
import { searchRelay } from "@/lib/searchRelay";
import { searchOnce } from "@/lib/searchOnce";
import { liftQuery, parseSearch, queryWords, withObserver } from "@/lib/searchSyntax";
import { DLIST_ITEM_KINDS } from "@/lib/dlistFields";
import type { SearchPov } from "./types";
import { lacksPerspective, resolveObserver } from "./query";

/** One list a search asks of: the key its answer comes back under, and the headers its items are filed under. */
export interface ListAsk {
  key: string;
  headers: string[];
  /** Its items whatever the words: the search is the list's own name ("books"). */
  whole?: boolean;
}

/** One list's answer: the items the relay matched, and whether it stopped at the cap, so more may match. */
export interface ListAnswer {
  events: NostrEvent[];
  full: boolean;
}

/**
 * The items of each list that a search's words find, from the search relay through the
 * search's lens: one filter per list in one REQ, so each list has a cap of its own and one
 * list's many matches don't crowd out another's few (the relay keeps each filter's limit under
 * NIP-50, probed 2026-10-21). The relay's matching is loose — "fork & coin" finds "Bitcoin for
 * Beginners" — so a caller keeps the whole-word matches (lib/listSearch). A list asked for
 * `whole` is asked through the lens alone, without the words: the relay answers that with
 * the list's items (probed 2026-10-22).
 *
 * Words only: a query with a hashtag, a mention or a kind other than list items asks nothing;
 * `from:` and dates narrow every list. Resolves at EOSE or the timeout with what arrived;
 * never rejects.
 */
export async function searchListItems(
  query: string,
  lists: readonly ListAsk[],
  {
    pov,
    userPubkey,
    limit = 50,
    timeoutMs = 6000,
  }: { pov: SearchPov; userPubkey?: string; limit?: number; timeoutMs?: number },
): Promise<Map<string, ListAnswer>> {
  const answers = new Map<string, ListAnswer>(lists.map((l) => [l.key, { events: [], full: false }]));
  const lifted = liftQuery(query);
  const relay = searchRelay();
  const kinds = [...DLIST_ITEM_KINDS];
  const asked =
    !!queryWords(query).trim() &&
    !lifted["#t"] &&
    !lifted["#p"] &&
    (!lifted.kinds || lifted.kinds.some((k) => (kinds as number[]).includes(k)));
  if (!relay || !asked || lists.length === 0) return answers;
  const observer = await resolveObserver({ tab: "all", pov, userPubkey }).catch(() => null);
  // No Perspective: no list items, rather than the unranked corpus's.
  if (lacksPerspective(query, observer)) return answers;
  const base = {
    kinds,
    search: withObserver(lifted.search, observer),
    ...(lifted.authors ? { authors: lifted.authors } : {}),
    ...(lifted.since != null ? { since: lifted.since } : {}),
    ...(lifted.until != null ? { until: lifted.until } : {}),
  };
  const parsed = parseSearch(query);
  const lens = withObserver(
    parsed.includeSpam ? "include:spam" : parsed.observer ? `observer:${parsed.observer}` : "",
    observer,
  );
  const listsOf = new Map<string, string[]>();
  for (const l of lists) for (const h of l.headers) listsOf.set(h, [...(listsOf.get(h) ?? []), l.key]);

  await searchOnce(
    lists.map((l) => ({ ...base, ...(l.whole ? { search: lens } : {}), "#z": l.headers, limit })),
    {
      relay,
      onEvent: (event) => {
        const keys = new Set(event.tags.filter((t) => t[0] === "z").flatMap((t) => listsOf.get(t[1]) ?? []));
        for (const key of keys) {
          const answer = answers.get(key)!;
          if (!answer.events.some((e) => e.id === event.id)) answer.events.push(event);
        }
      },
      timeoutMs,
    },
  );
  for (const answer of answers.values()) answer.full = answer.events.length >= limit;
  return answers;
}
