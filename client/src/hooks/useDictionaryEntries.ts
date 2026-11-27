import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useTrustSource } from "@/hooks/useLensRanks";
import { houseObserverQuery } from "@/lib/houseObserverQuery";
import { DICTIONARY_READS, askedUnder, useReadGeneration } from "@/lib/readGeneration";
import type { HeaderEvent } from "@/lib/conceptResolution";
import {
  conceptsOf,
  copyAuthorsOf,
  dictionaryEntriesOf,
  dictionaryFilters,
  readDictionaryHeaders,
  type DictionaryEntry,
  type DictionaryReader,
} from "@/services/dictionary";

const NONE: string[] = [];

/**
 * Whose copies are Brainstorm's own definitions (services/dictionary
 * `houseCopyAuthors`): the house observer — an HTTP answer, so a query
 * (lib/houseObserverQuery) — then the Assistant its kind 10040 names, from the
 * store (hooks/useLensRanks `useTrustSource`). Undefined until both are known;
 * empty when the house can't be found, and the community's definition governs.
 */
export function useHouseCopyAuthors(enabled = true): string[] | undefined {
  const house = useQuery({ ...houseObserverQuery, retry: 1, enabled });
  const source = useTrustSource(enabled ? (house.data ?? null) : null);
  const assistant = source?.taPubkey;
  const known = enabled && (house.isError || (!!house.data && source !== undefined));
  return useMemo(() => {
    if (!known) return undefined;
    if (!house.data) return NONE;
    return assistant && assistant !== house.data ? [house.data, assistant] : [house.data];
  }, [known, house.data, assistant]);
}

/** Dictionary reads are asked again at most this often: the lists change rarely. */
const DICTIONARY_WINDOW = { minMs: 5 * 60_000 };

/**
 * Concepts as `reader` reads them (services/dictionary `dictionaryEntriesOf`):
 * each one's community header and the copies that may govern — the reader's,
 * their Assistant's, the house's, `managers`' — from the EventStore while the
 * relays are asked (docs/adr/0005). No items: those load where they show
 * (hooks/useConceptItems).
 *
 * Shown as the store held them until the ask settles (`stream: false`), so a
 * concept never reads "not in your Dictionary" while its copy is still on the
 * way and then flips. `entries` is undefined until there is something to show:
 * the store held some of these headers, or the ask has settled. A copy the
 * reader publishes here lands in the store and shows at once; one published
 * elsewhere (their Assistant, from the server) shows after `readAgain` of
 * DICTIONARY_READS (lib/readGeneration).
 *
 * `ask` replaces the read of the headers — an item page's goes through the
 * page's concept batch (services/conceptBatch) — and `prefix` keeps its asks
 * apart from the Dictionary's.
 */
export function useDictionaryEntries(
  reader: DictionaryReader,
  concepts: readonly string[],
  {
    enabled = true,
    managers = NONE,
    window = DICTIONARY_WINDOW,
    prefix = "dictionary",
    ask,
  }: {
    enabled?: boolean;
    managers?: readonly string[];
    window?: { minMs: number };
    prefix?: string;
    ask?: (concepts: string[], copyAuthors: string[]) => Promise<unknown>;
  } = {},
): { entries: DictionaryEntry[] | undefined; settled: boolean } {
  const generation = useReadGeneration(DICTIONARY_READS);
  const house = useHouseCopyAuthors(enabled);
  const conceptsKey = concepts.join(" ");
  const managersKey = managers.join(" ");
  const asked = useMemo(() => conceptsOf(concepts), [conceptsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const copyAuthors = useMemo(
    () => (house ? copyAuthorsOf(reader, house, managers) : NONE),
    // `managersKey` is `managers`, as a value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [house, reader.pubkey, reader.taPubkey, managersKey],
  );
  const asking = enabled && !!house && asked.length > 0;
  const key = asking
    ? `${prefix}:${generation}:${JSON.stringify([reader.pubkey, reader.taPubkey, asked, copyAuthors])}`
    : null;
  const filters = useMemo(() => (asking ? dictionaryFilters(asked, copyAuthors) : null), [asking, asked, copyAuthors]);
  const read = useStoreEvents(
    key,
    filters,
    () => askedUnder(DICTIONARY_READS, ask ? ask(asked, copyAuthors) : readDictionaryHeaders(asked, copyAuthors)),
    { ...window, stream: false },
  );
  const entries = useMemo(
    () => (asking ? dictionaryEntriesOf(read.events as HeaderEvent[], reader, asked, house!, copyAuthors) : undefined),
    // The reader is in `copyAuthors`, and in the key the events are read under.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asking, read.events, asked, house, copyAuthors],
  );
  // Nothing to read: no concepts is an empty Dictionary, at once.
  if (enabled && !asked.length) return { entries: [], settled: true };
  const known = read.settled || read.events.length > 0;
  return { entries: known ? entries : undefined, settled: read.settled };
}
