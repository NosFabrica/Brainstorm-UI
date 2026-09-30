import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivePerspective } from "@/hooks/useActivePerspective";
import type { CarrierPerson } from "@/lib/tagCarrierPeople";
import { fetchTagCarrierPeople } from "@/services/tagCarriers";
import type { TagSummary } from "@/services/tags";

export interface TagCarriers {
  /** For each person, the matched tags they carry, in the matches' order. */
  byPubkey: Map<string, TagSummary[]>;
  /** Every carrier once, tag by tag in the matches' order. */
  people: CarrierPerson[];
  /** Every matched tag has answered (or failed, which is nobody). */
  settled: boolean;
}

const NONE: TagCarriers = { byPubkey: new Map(), people: [], settled: true };

/**
 * The people the matched tags are on, for the rows of a typeahead or a People
 * page — filling in as each tag answers. The service asks each tag once per
 * observer for the session; this only re-renders when an answer lands. Plain
 * state, no query client: the search boxes render without one.
 *
 * The observer follows the surface's perspective the way every tag query
 * does (`useTagObserver`): the viewer's own only when they chose it and are
 * signed in, else the house.
 */
export function useTagCarriers(
  tags: readonly TagSummary[],
  { pov, viewerPubkey }: { pov: ActivePerspective; viewerPubkey?: string },
): TagCarriers {
  const observer = pov === "mywot" && viewerPubkey ? viewerPubkey : "house";
  const key = `${observer}|${tags.map((t) => t.key).join(",")}`;
  const [version, setVersion] = useState(0);
  const answers = useRef(new Map<string, CarrierPerson[]>());
  const askedRef = useRef(new Set<string>());
  // Answers are wanted for as long as this component lives, not just until
  // the matched tags change again (see usePersonTags).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    for (const tag of tags) {
      const id = `${observer}|${tag.key}`;
      if (askedRef.current.has(id)) continue;
      askedRef.current.add(id);
      fetchTagCarrierPeople(tag, observer).then(
        (people) => {
          answers.current.set(id, people);
          if (mounted.current) setVersion((v) => v + 1);
        },
        () => {
          askedRef.current.delete(id);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useMemo(() => {
    if (tags.length === 0) return NONE;
    const byPubkey = new Map<string, TagSummary[]>();
    const people: CarrierPerson[] = [];
    let settled = true;
    for (const tag of tags) {
      const answer = answers.current.get(`${observer}|${tag.key}`);
      if (!answer) {
        settled = false;
        continue;
      }
      for (const person of answer) {
        const carried = byPubkey.get(person.pubkey);
        if (carried) carried.push(tag);
        else {
          byPubkey.set(person.pubkey, [tag]);
          people.push(person);
        }
      }
    }
    return { byPubkey, people, settled };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}
