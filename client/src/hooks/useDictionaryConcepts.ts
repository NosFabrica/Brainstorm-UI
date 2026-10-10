import { useEffect, useMemo, useState } from "react";
import { CONCEPT_LIST, CONCEPT_LIST_AUTHOR, CURATOR_TAG, ROLE_CONCEPTS, dictionaryRelays } from "@/config/dictionary";
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
const REMEMBERED = `dictionary-concepts:${CONCEPT_LIST}`;

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
 * The concepts the Dictionary shows, read from the Demo Dictionary Concepts
 * list (config/dictionary, lib/dictionaryConcepts) instead of a deploy: the
 * entries its curators filed — the list's author, and whoever the house
 * tagged "Dictionary Concept Curator". One ask, both reads at once (the
 * entries and the house's taggings), into the EventStore (ADR 0005); every
 * page that needs the set shares it, and it stays live as events arrive.
 *
 * Until an answer settles, the set is the one the device last read (a
 * streaming answer may be partial). An empty answer never replaces a
 * remembered one: relays that failed read as empty, and a Dictionary with
 * nothing in it is no one's intent.
 */
export function useDictionaryConcepts(): DictionaryConcepts {
  const house = useHouse();
  const filters = useMemo(
    () =>
      house === undefined
        ? null
        : [
            { kinds: [39999], "#z": [CONCEPT_LIST] },
            ...(house ? [{ kinds: [39999], authors: [house], "#a": [CURATOR_TAG] }] : []),
          ],
    [house],
  );
  const { events, settled } = useStoreEvents(
    filters ? `dictionary-concepts:${house ?? "no-house"}` : null,
    filters,
    () => readListEvents(filters ?? [], READ_MS, dictionaryRelays()),
    WINDOW,
  );

  const read = useMemo(() => {
    const curators = curatorsOf(events, {
      house: house ?? null,
      curatorTag: CURATOR_TAG,
      listAuthor: CONCEPT_LIST_AUTHOR,
    });
    return conceptsOf(events, curators, CONCEPT_LIST).filter((c) => !ROLE_CONCEPTS.includes(c));
  }, [events, house]);

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
