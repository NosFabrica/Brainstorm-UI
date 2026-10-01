import { useEffect, useMemo, useState } from "react";
import type { ActivePerspective } from "@/hooks/useActivePerspective";
import type { CarrierPerson } from "@/lib/tagCarrierPeople";
import { fetchSearchTags, type SearchTag } from "@/services/searchTags";
import type { TagSummary } from "@/services/tags";

/** The people the matched tags are on, in the shape `lib/tagCarrierPeople` reads. */
export interface TagCarriers {
  /** For each person, the matched tags they carry, in the matches' order. */
  byPubkey: Map<string, TagSummary[]>;
  /** Every carrier once, tag by tag in the matches' order. */
  people: CarrierPerson[];
  /** The relay has answered (or failed, which is nobody). */
  settled: boolean;
}

export interface SearchTags {
  /** The tags the words matched, best first, at most `max`. */
  tags: SearchTag[];
  carriers: TagCarriers;
  /** False from the moment the words change until their answer is in. */
  settled: boolean;
}

const NO_TAGS: SearchTag[] = [];

/**
 * The tags a search's words match and the people who carry them, from the
 * search relay (`services/searchTags`) — one fast ask per query, through the
 * perspective the surface is showing: the viewer's own only when they chose
 * it and are signed in, else the house.
 *
 * Plain state, no query client: the search boxes render without one. A
 * typeahead passes `pauseMs` so a word being typed asks once, where it came
 * to rest; a results page asks at once. An answer for words the reader has
 * moved on from is dropped.
 */
export function useSearchTags(
  query: string,
  {
    pov,
    viewerPubkey,
    max = 3,
    members = false,
    pauseMs = 0,
  }: { pov: ActivePerspective; viewerPubkey?: string; max?: number; members?: boolean; pauseMs?: number },
): SearchTags {
  const words = query.trim();
  const live = words.length >= 2;
  const mine = pov === "mywot" && !!viewerPubkey;
  const key = `${mine ? viewerPubkey : "house"}|${members ? "people" : "lists"}|${words.toLowerCase()}`;
  const [answer, setAnswer] = useState<{ key: string; tags: SearchTag[] } | null>(null);

  useEffect(() => {
    if (!live) return;
    let current = true;
    const ask = () => {
      void fetchSearchTags(
        words,
        { pov: mine ? "mywot" : "nosfabrica", userPubkey: mine ? viewerPubkey : undefined },
        { members },
      ).then((tags) => {
        if (current) setAnswer({ key, tags });
      });
    };
    const timer = pauseMs > 0 ? setTimeout(ask, pauseMs) : (ask(), undefined);
    return () => {
      current = false;
      if (timer !== undefined) clearTimeout(timer);
    };
    // `key` is the question: the words, the perspective and the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, live, pauseMs]);

  const settled = !live || answer?.key === key;
  const all = live && answer?.key === key ? answer.tags : NO_TAGS;

  return useMemo(() => {
    const tags = all.slice(0, max);
    const byPubkey = new Map<string, TagSummary[]>();
    const people: CarrierPerson[] = [];
    const seen = new Set<string>();
    for (const tag of tags) {
      for (const member of tag.members) {
        const carried = byPubkey.get(member.pubkey) ?? [];
        carried.push(tag);
        byPubkey.set(member.pubkey, carried);
        // A row needs a name: a member the relay sent no profile for is counted, not listed.
        if (!member.profile || seen.has(member.pubkey)) continue;
        seen.add(member.pubkey);
        people.push({ ...member.profile, applications: member.endorsements, addedAt: 0 });
      }
    }
    return { tags, carriers: { byPubkey, people, settled }, settled };
  }, [all, max, settled]);
}
