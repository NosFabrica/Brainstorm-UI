import { useEffect, useState } from "react";
import { fetchTagMembers } from "@/services/tagLists";
import type { Members, SearchPov } from "@/services/search";

/**
 * Who and what carries a pressed tag, from its Trusted Lists (services/tagLists): what All asks
 * the relay for when the tag narrows it. `members` is null until the lists answer, and after,
 * when the tag has none. Plain state, like the other search reads; an answer for a tag the reader
 * has let go of is dropped.
 */
export function useTagMembers(
  tag: { key: string; name: string } | null,
  { pov, userPubkey }: { pov: SearchPov; userPubkey?: string },
): { members: Members | null; settled: boolean } {
  const key = tag ? `${pov === "mywot" && userPubkey ? userPubkey : "house"}|${tag.key}|${tag.name}` : "";
  const [answer, setAnswer] = useState<{ key: string; members: Members | null } | null>(null);

  useEffect(() => {
    if (!tag) return;
    let current = true;
    void fetchTagMembers(tag, { pov, userPubkey }).then((members) => {
      if (current) setAnswer({ key, members });
    });
    return () => {
      current = false;
    };
    // `key` is the question: the tag and the perspective.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!tag) return { members: null, settled: true };
  return answer?.key === key ? { members: answer.members, settled: true } : { members: null, settled: false };
}
