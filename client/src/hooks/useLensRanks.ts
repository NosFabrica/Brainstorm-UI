import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";
import { houseObserverQuery } from "@/lib/houseObserverQuery";
import { ranksFrom } from "@/lib/placeReviews";
import { readLensRanks } from "@/services/placeReviews";
import { trustSourceOf, type TrustSourceRef } from "@/services/trustSource";
import { authorRanksFrom, readAuthorRanks, type AuthorRanks, type RankObserver } from "@/services/wotRanks";

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Where `observer`'s rank scores live: the scorer their kind 10040 names
 * (services/trustSource `trustSourceOf`), read from the store while the
 * relays are asked, newest wins (hooks/useTrustProviderStatus). Undefined
 * until that ask has settled — a held copy may be stale, and a lens must not
 * change under the reader — and null when they name no scorer (or there is
 * no observer).
 */
export function useTrustSource(observer: string | null | undefined): TrustSourceRef | null | undefined {
  const valid = !!observer && HEX64.test(observer);
  const list = useTrustProviderList(valid ? observer : null);
  if (!valid) return null;
  if (!list.settled) return undefined;
  return trustSourceOf(list.event);
}

/** Lens ranks are asked again at most this often: a scorer recomputes nightly. */
const RANKS_WINDOW = { minMs: 5 * 60_000 };

/** The scorer's kind 30382s about these people, from the store while its relay is asked. */
function useRankEvents(
  prefix: string,
  source: TrustSourceRef | null | undefined,
  people: readonly string[],
  ask: (source: TrustSourceRef, people: string[]) => Promise<unknown>,
  window: { minMs: number },
) {
  const peopleKey = people.join(",");
  const key = source && people.length ? `${prefix}:${source.taPubkey}:${source.relay}:${peopleKey}` : null;
  const filters = useMemo(
    () => (source && people.length ? [{ kinds: [30382], authors: [source.taPubkey], "#d": [...people] }] : null),
    // `key` names the scorer and the people.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useStoreEvents(key, filters, () => ask(source!, [...people]), window);
}

/**
 * Each of `people`'s rank in a lens (lib/placeReviews `ranksFrom`): from the
 * scorer `source` names, its kind 30382s held in the store while its relay is
 * asked. Undefined while the lens is not known yet or its ranks are being
 * read — a star value through it would change as they arrive; null when there
 * is no lens (no scorer named), and nobody counts through it.
 */
export function useLensRanks(
  source: TrustSourceRef | null | undefined,
  people: readonly string[],
): Map<string, number> | null | undefined {
  const read = useRankEvents("lens-ranks", source, people, readLensRanks, RANKS_WINDOW);
  const ranks = useMemo(
    () => (source ? ranksFrom(read.events, source.taPubkey) : null),
    // The scorer is in the events' own filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read.events, source?.taPubkey],
  );
  if (source === undefined) return undefined;
  if (source === null) return null;
  if (people.length === 0) return new Map();
  return read.settled ? ranks : undefined;
}

/**
 * Authors' ranks from `observer`'s Perspective (services/wotRanks): their own
 * scorer, else the house's — never "everyone" — read from the store while the
 * relays are asked: the 10040s first (useTrustSource), then the ranks keyed on
 * the scorer they name. `pending` until the ranks of the scorer that answers
 * have been read; until then no ranks, and no source.
 */
export function useAuthorRanks(
  authors: readonly string[],
  observer: RankObserver,
  window = { minMs: 10 * 60_000 },
): AuthorRanks & { pending: boolean } {
  const any = authors.length > 0;
  const own = useTrustSource(any && observer !== "house" ? observer : null);
  // The house answers for the Brainstorm Perspective, and for a reader who names no scorer of their own.
  const needHouse = any && (observer === "house" || own === null);
  const house = useQuery({ ...houseObserverQuery, retry: 1, enabled: needHouse });
  const houseSource = useTrustSource(needHouse ? (house.data ?? null) : null);

  let resolved: { ref: TrustSourceRef; source: "observer" | "house" } | null | undefined;
  if (!any) resolved = null;
  else if (own) resolved = { ref: own, source: "observer" };
  else if (own === undefined && observer !== "house") resolved = undefined;
  else if (house.isError) resolved = null;
  else if (!house.data || houseSource === undefined) resolved = undefined;
  else resolved = houseSource ? { ref: houseSource, source: "house" } : null;

  const ref = resolved?.ref;
  const read = useRankEvents("author-ranks", ref, authors, readAuthorRanks, window);
  const ranks = useMemo(
    () => (ref ? authorRanksFrom(read.events, ref.taPubkey, authors) : new Map<string, number>()),
    // The scorer and the authors are the events' own filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read.events, ref?.taPubkey],
  );
  const pending = any && (resolved === undefined || (!!resolved && !read.settled));
  // Nothing until the ranks are read, as the query this replaced answered: a verdict mustn't change as they land.
  return {
    ranks: resolved && !pending ? ranks : NO_RANKS,
    source: pending ? null : (resolved?.source ?? null),
    pending,
  };
}

const NO_RANKS = new Map<string, number>();
