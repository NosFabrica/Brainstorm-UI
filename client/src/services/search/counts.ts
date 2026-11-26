/** How many results a tab, or one of All's categories, holds for the words: NIP-45 COUNTs on side sockets. */
import type { Relay } from "applesauce-relay";
import { openSideSearchRelay } from "@/lib/searchRelay";
import { applyFilters, readFilters, type searchFilters } from "@/lib/searchSyntax";
import type { SearchTab } from "./tabs";
import type { SearchParams } from "./types";
import { lacksPerspective, resolveObserver } from "./query";
import { askForTab } from "./stream";

/** How long the tab counts wait for the relay, at most: a count not in by then is unknown. */
const TAB_COUNT_TIMEOUT_MS = 8000;

/**
 * The kinds whose hits make a searching REQ serve their subjects as well (vespa-relay's reference
 * expansion): NIP-32 labels, NIP-85 assertions and Trusted Lists, people lists and follow packs.
 * A COUNT doesn't see those rows: People for "AOS 2026 Participant" counted 0 where its REQ
 * served 88 profiles, Issues for "P4" 2 where it served 38 (probed 2026-10-22).
 */
const POINTER_KINDS = [1985, 30382, 30383, 30384, 30392, 30393, 30394, 30000, 39089, 39092];

/** The pointers question rides in `onCount`'s results under this key, never as a tab. */
const POINTERS = "pointers";

/**
 * How many results each tab holds for these words, through the lens the page reads them in: one
 * NIP-45 COUNT per tab of the very filters the tab itself would ask (askForTab), all on a socket
 * of their own (lib/searchRelay's openSideSearchRelay) so they never queue in front of the page's
 * own requests, closed once every count is in. A tab with nothing to ask holds 0, and a count that
 * fails or doesn't arrive in time is null: unknown, never zero. Cancel by calling the returned
 * function.
 *
 * A COUNT of zero is not always an empty page: a REQ also serves what matching pointers name
 * (POINTER_KINDS), and a COUNT counts none of it. So one more COUNT asks whether any pointer, from
 * anyone (`include:spam`), matches the words; when one does, or that answer doesn't come, every
 * zero is reported as unknown. The answers arrive through `onCount` once all are in.
 *
 * Asked newest-first, since best match matches fewer for the same words (profiles for "ramen" 79
 * vs 192, 2026-10-22), unless the words ask `sort:text`, which applies no trust floor and matches
 * more still (30,255 for "ramen"). A single filter's count drops its page size so More can order
 * by it; a union keeps each filter's, since unbounded it recalls every matching id per filter
 * ("bitcoin #nostr": 7.1s unbounded, 0.15s bounded) — a zero stays a zero either way.
 */
export function countTabs(
  query: string,
  tabs: readonly SearchTab[],
  lens: Pick<SearchParams, "pov" | "userPubkey">,
  onCount: (tab: SearchTab, count: number | null) => void,
  timeoutMs = TAB_COUNT_TIMEOUT_MS,
): () => void {
  const sort = readFilters(query).sort === "text" ? "sort:text" : "sort:recent";
  return countQuestions(
    `${applyFilters(query, { sort: null })} ${sort}`.trim(),
    lens,
    (words, observer) => [
      ...tabs.map((tab) => ({ key: tab as string, filters: askForTab(words, { tab, ...lens }, observer).filters })),
      { key: POINTERS, filters: askForTab(words, { tab: "all", kinds: POINTER_KINDS, ...lens }, null).filters },
    ],
    // A zero from a tab that asked becomes unknown while a pointer might add to it. A tab that
    // asked nothing sends no REQ, so nothing can add to it.
    (answers, asked) => {
      const pointers = answers.get(POINTERS);
      for (const tab of tabs) {
        const n = answers.get(tab) ?? null;
        onCount(tab, n === 0 && asked.has(tab) && pointers !== 0 ? null : n);
      }
    },
    timeoutMs,
  );
}

/** One of All's categories, as a count asks it: kinds, and a list's `#z` (hooks/useAllCategories). */
export interface CategoryAsk {
  key: string;
  kinds: number[];
  tags?: Record<`#${string}`, string[]>;
  /** Asked as this tab asks, in place of its kinds: Events with Event Index's items, Recipes by their tag. */
  tab?: SearchTab;
  /** Asked without the words, which are its own name: a Dictionary list's items, all of them. */
  whole?: boolean;
}

/**
 * How many results each of All's categories holds for these words — countTabs' way, the very
 * filters the category's own page asks (All's, narrowed to its kinds and tags), on the side socket.
 * Unlike a tab's, in the page's own order: best match matches fewer than newest-first, and asked
 * so it is the number the page holds (Food and Drink Places for "burger": 701 counted, 701 sent;
 * newest-first counts 704 — probed 2026-10-28). A count that fails or doesn't arrive in time is null.
 * `lanes` spreads them over that many sockets, since the relay answers one socket's counts one at
 * a time (vespa-relay's per-connection search gate).
 */
export function countCategories(
  query: string,
  categories: readonly CategoryAsk[],
  lens: Pick<SearchParams, "pov" | "userPubkey">,
  onCounts: (counts: Map<string, number | null>) => void,
  { lanes = 1, timeoutMs = TAB_COUNT_TIMEOUT_MS }: { lanes?: number; timeoutMs?: number } = {},
): () => void {
  return countQuestions(
    query,
    lens,
    (words, observer) =>
      categories.map((c) => ({
        key: c.key,
        filters: askForTab(
          c.whole ? "" : words,
          c.tab ? { tab: c.tab, ...lens } : { tab: "all", kinds: c.kinds, tags: c.tags, ...lens },
          observer,
        ).filters,
      })),
    (answers) => onCounts(new Map(categories.map((c) => [c.key, answers.get(c.key) ?? null]))),
    timeoutMs,
    lanes,
  );
}

/**
 * A COUNT per question on side sockets of their own — `lanes` of them at most, the questions dealt
 * among them in turn — reported once every answer is in or timed out.
 */
function countQuestions(
  query: string,
  lens: Pick<SearchParams, "pov" | "userPubkey">,
  build: (words: string, observer: string | null) => { key: string; filters: ReturnType<typeof searchFilters> }[],
  onAnswers: (answers: Map<string, number | null>, asked: Set<string>) => void,
  timeoutMs: number,
  lanes = 1,
): () => void {
  let cancelled = false;
  let relays: Relay[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const subs: { unsubscribe: () => void }[] = [];
  const answers = new Map<string, number | null>();
  const asked = new Set<string>();
  const close = () => {
    clearTimeout(timer);
    subs.forEach((s) => s.unsubscribe());
    relays.forEach((r) => r.close());
    relays = [];
  };
  const report = () => {
    if (!cancelled) onAnswers(answers, asked);
  };
  const settle = (key: string, count: number | null) => {
    if (cancelled || answers.has(key)) return;
    answers.set(key, count);
    if ([...asked].every((k) => answers.has(k))) {
      close();
      report();
    }
  };
  const bounded = (filters: ReturnType<typeof searchFilters>) =>
    filters.length > 1 ? filters : filters.map(({ limit: _limit, ...rest }) => rest);

  void (async () => {
    const observer = await resolveObserver({ tab: "top", ...lens });
    if (cancelled) return;
    // No Perspective: every count is unknown rather than a count of the unranked corpus.
    if (lacksPerspective(query, observer)) {
      for (const { key } of build(query, observer)) answers.set(key, null);
      return report();
    }
    const questions = build(query, observer);
    for (const { key, filters } of questions) {
      if (filters.length === 0) answers.set(key, 0);
      else asked.add(key);
    }
    if (asked.size === 0) return report();
    for (let i = 0; i < Math.min(lanes, asked.size); i++) {
      const socket = openSideSearchRelay();
      if (socket) relays.push(socket);
    }
    if (!relays.length) {
      asked.forEach((key) => answers.set(key, null));
      return report();
    }
    const lanesOpen = relays;
    // Set the timer BEFORE subscribing: a synchronous answer (the fake transport in tests) can
    // settle every count during subscribe, and close() clears this timer.
    timer = setTimeout(() => [...asked].forEach((key) => settle(key, null)), timeoutMs);
    let dealt = 0;
    for (const { key, filters } of questions) {
      if (!asked.has(key)) continue;
      subs.push(
        lanesOpen[dealt++ % lanesOpen.length].count(bounded(filters)).subscribe({
          next: (r: { count?: number }) => settle(key, typeof r?.count === "number" ? r.count : null),
          error: () => settle(key, null),
          complete: () => settle(key, null),
        }),
      );
    }
  })();

  return () => {
    cancelled = true;
    close();
  };
}
