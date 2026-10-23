import { useEffect, useMemo, useState } from "react";
import { CURATOR_TAG, ROLE_CONCEPTS, dictionaryRelays } from "@/config/dictionary";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { conceptsOf, curatorsOf } from "@/lib/dictionaryConcepts";
import { readListEvents } from "@/services/listReads";
import { resolveHouseObserver } from "@/services/trustSource";

export interface DictionaryConcepts {
  /** What the Dictionary lists and search can name: the curated concepts, infrastructure aside. */
  shown: string[];
  /** What an item's page draws through its definition: the shown ones and infrastructure (URL Templates). */
  rendered: string[];
  /**
   * Whether the set is settled enough to decide a page by. False only on a
   * device's first read, before any answer: a list item's page waits then,
   * rather than draw the tag table and swap.
   */
  known: boolean;
}

/** Asked again at most every five minutes, as the rest of the Dictionary's reads go stale. */
const WINDOW = { minMs: 5 * 60_000, spreadMs: 30_000 };
const READ_MS = 8000;
const REMEMBERED = `dictionary-concepts:${CURATOR_TAG}`;

let held: string[] | null | undefined;

/** The set this device last read, so the next visit decides its pages at once. */
function rememberedConcepts(): string[] | null {
  if (held !== undefined) return held;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REMEMBERED) || "null");
    held = Array.isArray(value) && value.every((c) => typeof c === "string") ? value : null;
  } catch {
    held = null;
  }
  return held;
}

function remember(concepts: string[]): void {
  held = concepts;
  try {
    localStorage.setItem(REMEMBERED, JSON.stringify(concepts));
  } catch {
    /* private window, full quota — remembering is a convenience */
  }
}

/** Test seam: forget the remembered set, as a fresh device would. */
export function __forgetDictionaryConcepts(): void {
  held = undefined;
}

/** The house observer (services/trustSource): undefined while it's found, null when it can't be. */
function useHouse(): string | null | undefined {
  const [house, setHouse] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void resolveHouseObserver()
      .catch(() => null)
      .then((pk) => alive && setHouse(pk));
    return () => {
      alive = false;
    };
  }, []);
  return house;
}

/**
 * The concepts the Dictionary shows (lib/dictionaryConcepts), read instead of
 * deployed: the house's "Dictionary Concept Curator" taggings say who curates,
 * then those curators' headers that point at themselves are the concepts. Two
 * asks into the EventStore (ADR 0005), the second keyed on the curators the
 * first settled on, so it isn't asked again per tagging that arrives; every
 * page that needs the set shares it, and it stays live as events arrive.
 *
 * Until an answer settles, the set is the one the device last read (a
 * streaming answer may be partial). An empty answer never replaces a
 * remembered one: relays that failed read as empty, and a Dictionary with
 * nothing in it is no one's intent.
 */
export function useDictionaryConcepts(): DictionaryConcepts {
  const house = useHouse();
  const taggingFilters = useMemo(
    () => (house ? [{ kinds: [39999], authors: [house], "#a": [CURATOR_TAG] }] : null),
    [house],
  );
  const taggings = useStoreEvents(
    house ? `dictionary-curators:${house}` : null,
    taggingFilters,
    () => readListEvents(taggingFilters ?? [], READ_MS, dictionaryRelays()),
    WINDOW,
  );
  const curators = useMemo(
    () => curatorsOf(taggings.events, { house: house ?? null, curatorTag: CURATOR_TAG }).sort(),
    [taggings.events, house],
  );

  const curatorsKey = taggings.settled ? curators.join(",") : "";
  const headerFilters = useMemo(
    () => (curatorsKey ? [{ kinds: [39998], authors: curatorsKey.split(",") }] : null),
    [curatorsKey],
  );
  const headers = useStoreEvents(
    curatorsKey ? `dictionary-concepts:${curatorsKey}` : null,
    headerFilters,
    () => readListEvents(headerFilters ?? [], READ_MS, dictionaryRelays()),
    WINDOW,
  );

  const read = useMemo(
    () => conceptsOf(headers.events, curators).filter((c) => !ROLE_CONCEPTS.includes(c)),
    [headers.events, curators],
  );
  // No house, nothing to ask: settled on nothing, so a page doesn't wait for good.
  const settled = house === null || (taggings.settled && (!curatorsKey || headers.settled));

  useEffect(() => {
    if (settled && read.length) remember(read);
  }, [settled, read]);

  // While the answer streams in it may be partial: the remembered set holds until it settles.
  const before = rememberedConcepts();
  const shown = useMemo(
    () => (settled ? (read.length ? read : (before ?? read)) : (before ?? read)),
    [settled, read, before],
  );
  const rendered = useMemo(() => [...shown, ...ROLE_CONCEPTS], [shown]);
  return { shown, rendered, known: settled || before !== null };
}
