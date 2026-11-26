import { useStoreEvents } from "@/hooks/useStoreEvents";
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
  // One ask per lists and perspective per window, shared by every mount (useStoreEvents over
  // lib/askOnce, docs/adr/0005); the tags are what the ask derives from the assertions it read.
  const read = useStoreEvents(asked.length ? `list-tags:${key}` : null, null, async () => {
    const each = await Promise.all(asked.map((l) => fetchListTags(l, { pov, userPubkey }).catch(() => [])));
    const seen = new Set<string>();
    return each
      .flat()
      .sort((a, b) => b.items - a.items)
      .filter((t) => !seen.has(t.key) && seen.add(t.key))
      .map(({ items: _items, ...t }) => t);
  });

  if (!asked.length) return { tags: NONE, settled: true };
  const tags = read.answer as ResultTag[] | undefined;
  return tags ? { tags, settled: true } : { tags: NONE, settled: read.settled };
}
