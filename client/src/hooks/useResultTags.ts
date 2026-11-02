import { useEffect, useMemo, useState } from "react";
import { gatherTags, tagTargets, targetsOf, type ResultTag } from "@/lib/resultTags";
import type { SearchHit } from "@/services/search";
import { fetchEventTagsBatch, fetchProfileTagsBatch, type TrustObserver } from "@/services/tags";

/** How long new results wait for others before their tags are asked together. */
const ASK_AFTER_MS = 300;

/** What each target is tagged, per perspective — kept for the visit, so Back and More ask only what's new. */
const known = new Map<string, ResultTag[]>();
const asking = new Set<string>();

/** Test seam: forget every result's tags. */
export const __forgetResultTags = () => {
  known.clear();
  asking.clear();
};

const keyOf = (observer: TrustObserver, target: string) => `${observer}|${target}`;
const NONE: readonly SearchHit[] = [];

/** Only what the network carries: a tag a person only says of themselves isn't the network's. */
const carried = (tags: ReadonlyArray<ResultTag & { counted: boolean }> | undefined): ResultTag[] =>
  (tags ?? [])
    .filter((t) => t.counted)
    .map(({ key, authorPubkey, slug, name, description }) => ({ key, authorPubkey, slug, name, description }));

export interface ResultTags {
  /** The tags the results carry, most carried first. */
  tags: ResultTag[];
  /** Which tags each result carries, by event id. */
  byHit: ReadonlyMap<string, ReadonlySet<string>>;
  /** Every result's tags are in (or failed, which is none). */
  settled: boolean;
}

/**
 * The tags a page of search results carry, for its tag filters: each result's tags as its own
 * page shows them (services/tags — a person's profile chips, a note's or list item's tags), so a
 * tagging counts when its tagger counts through the perspective and support beats disputes. Asked
 * in one batch for the results as they land; a result the page already asked about is not asked
 * again.
 *
 * Only what is loaded: a tag on a result past the page isn't offered until More brings it in.
 */
export function useResultTags(
  hits: readonly SearchHit[],
  { observer, enabled }: { observer: TrustObserver; enabled: boolean },
): ResultTags {
  const [version, setVersion] = useState(0);
  const live = enabled ? hits : NONE;

  useEffect(() => {
    if (!live.length) return;
    const timer = setTimeout(() => {
      const { pubkeys, events } = tagTargets(live);
      const fresh = (t: string) => !known.has(keyOf(observer, t)) && !asking.has(keyOf(observer, t));
      const people = pubkeys.filter(fresh);
      const things = events.filter(fresh);
      if (!people.length && !things.length) return;
      for (const t of [...people, ...things]) asking.add(keyOf(observer, t));
      void Promise.all([
        people.length ? fetchProfileTagsBatch(people, undefined, observer).catch(() => null) : null,
        things.length ? fetchEventTagsBatch(things, undefined, observer).catch(() => null) : null,
      ]).then(([onPeople, onThings]) => {
        for (const t of people) known.set(keyOf(observer, t), carried(onPeople?.get(t)?.tags));
        for (const t of things) known.set(keyOf(observer, t), carried(onThings?.get(t)?.tags));
        for (const t of [...people, ...things]) asking.delete(keyOf(observer, t));
        setVersion((v) => v + 1);
      });
    }, ASK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [live, observer]);

  return useMemo(() => {
    const tagsOn = (t: string) => known.get(keyOf(observer, t));
    const { tags, byHit } = gatherTags(live, tagsOn);
    const settled = live.every((h) => targetsOf(h).every((t) => tagsOn(t) !== undefined));
    return { tags, byHit, settled };
    // `version` says what `known` holds has grown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, observer, version]);
}
