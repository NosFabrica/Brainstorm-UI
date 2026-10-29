import { useEffect, useState } from "react";
import { fetchNamedTags, type NamedTag } from "@/services/namedTags";
import type { SearchPov } from "@/services/search";

const NONE: NamedTag[] = [];

/**
 * The tags a search's words name outright, each with what carries it (services/namedTags): a tab
 * of its own in All's row. Plain state, like the other search reads; an answer for words the
 * reader has moved on from is dropped.
 */
export function useNamedTags(
  query: string,
  { pov, userPubkey, enabled }: { pov: SearchPov; userPubkey?: string; enabled: boolean },
): { tags: NamedTag[]; settled: boolean } {
  const words = enabled ? query.trim() : "";
  const key = `${pov === "mywot" && userPubkey ? userPubkey : "house"}|${words.toLowerCase()}`;
  const [answer, setAnswer] = useState<{ key: string; tags: NamedTag[] } | null>(null);

  useEffect(() => {
    if (words.length < 2) return;
    let current = true;
    void fetchNamedTags(words, { pov, userPubkey }).then((tags) => {
      if (current) setAnswer({ key, tags });
    });
    return () => {
      current = false;
    };
    // `key` is the question: the words and the perspective.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (words.length < 2) return { tags: NONE, settled: true };
  return answer?.key === key ? { tags: answer.tags, settled: true } : { tags: NONE, settled: false };
}
