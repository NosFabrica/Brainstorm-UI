import { useEffect, useState } from "react";
import type { ResultTag } from "@/lib/resultTags";
import type { SearchPov } from "@/services/search";
import { fetchListTags } from "@/services/tagLists";

const NONE: ResultTag[] = [];

/**
 * The tags kept on these Dictionary lists' items (services/tagLists `fetchListTags`), most items
 * first: filters for a list's page that don't depend on which of its items are loaded.
 * `settled` once every list has answered.
 */
export function useListTags(
  lists: readonly { coordinate: string; name: string }[],
  { pov, userPubkey, enabled }: { pov: SearchPov; userPubkey?: string; enabled: boolean },
): { tags: ResultTag[]; settled: boolean } {
  const asked = enabled ? lists : [];
  const key = [
    pov === "mywot" && userPubkey ? userPubkey : "house",
    ...asked.map((l) => `${l.coordinate}=${l.name}`),
  ].join("\n");
  const [answer, setAnswer] = useState<{ key: string; tags: ResultTag[] } | null>(null);

  useEffect(() => {
    if (!asked.length) return;
    let current = true;
    void Promise.all(asked.map((l) => fetchListTags(l, { pov, userPubkey }).catch(() => []))).then((each) => {
      if (!current) return;
      const seen = new Set<string>();
      const tags = each
        .flat()
        .sort((a, b) => b.items - a.items)
        .filter((t) => !seen.has(t.key) && seen.add(t.key))
        .map(({ items: _items, ...t }) => t);
      setAnswer({ key, tags });
    });
    return () => {
      current = false;
    };
    // `key` is the question: the lists and the perspective.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!asked.length) return { tags: NONE, settled: true };
  return answer?.key === key ? { tags: answer.tags, settled: true } : { tags: NONE, settled: false };
}
