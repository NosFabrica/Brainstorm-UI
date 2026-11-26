import { useMemo } from "react";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { useSearchPriority } from "@/hooks/useSearchPriority";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useMyFollows } from "@/hooks/useMyFollows";
import { rankEndorsers } from "@/services/endorsements";
import { itemsReactionFilters, readItemsReactions } from "@/services/itemEngagement";
import { endorsersByItem, type Endorser } from "@/lib/itemEngagement";

const NONE = new Map<string, Endorser[]>();

/**
 * How many people the reader trusts recommend each of many items — what
 * search shows at once: the items' endorsements in one batch
 * (services/itemEngagement), counted the way every endorsement surface
 * counts them (services/endorsements: people the reader follows, then
 * accounts above the verified line). Signed out, "people you trust" are the
 * verified ones, and the words say so.
 *
 * `settled`: false while `items` are still streaming in. The reactions are
 * asked once they have (CODING_STANDARDS, "settled before dependents"): keyed
 * on a list that grows per arriving item, the ask would re-key and send a REQ
 * each time. What the store already holds counts meanwhile.
 */
export function useTrustedRecommenders(
  items: readonly { id: string; address: string | null }[],
  { settled = true }: { settled?: boolean } = {},
) {
  const ids = items.map((i) => i.id);
  // On the Top page, after the search's own results: this only orders rows (hooks/useSearchPriority).
  const ready = useSearchPriority() && settled;
  // The ids name the items; the addresses are what the ids are of. From the
  // store while the relays are asked (docs/adr/0005).
  const idsKey = ids.join(",");
  const filters = useMemo(() => (items.length ? itemsReactionFilters([...items]) : null), [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const reactions = useStoreEvents(
    ready && items.length > 0 ? `items-reactions:${idsKey}` : null,
    filters,
    () => readItemsReactions([...items]),
    { minMs: 60_000 },
  );
  const byItem = useMemo(
    () => (reactions.events.length ? endorsersByItem(reactions.events, [...items]) : NONE),
    [reactions.events, idsKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { follows, signedIn } = useMyFollows();
  const scoreOf = useAuthorScores([...new Set([...byItem.values()].flat().map((e) => e.pubkey))]);
  // An item and its copies (the same thing filed twice) count as one: everyone who endorsed any of them, once.
  const countOf = (ids: string | readonly string[]) => {
    const all = (typeof ids === "string" ? [ids] : ids).flatMap((id) => byItem.get(id) ?? []);
    return rankEndorsers(all, { follows, scoreOf }).filter((e) => e.group !== "other").length;
  };
  return { countOf, who: signedIn ? "you trust" : "verified" } as const;
}

/** "Recommended by 2 people you trust", "by 1 verified person"; null for none. */
export function recommendedLine(count: number, who: "you trust" | "verified"): string | null {
  if (count <= 0) return null;
  const people = count === 1 ? "person" : "people";
  return who === "verified"
    ? `Recommended by ${count} verified ${people}`
    : `Recommended by ${count} ${people} you trust`;
}
