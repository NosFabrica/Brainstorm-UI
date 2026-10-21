import { useQuery } from "@tanstack/react-query";
import { useAuthorScores } from "@/hooks/useAuthorScores";
import { useMyFollows } from "@/hooks/useMyFollows";
import { rankEndorsers } from "@/services/endorsements";
import { fetchItemsReactions } from "@/services/itemEngagement";
import type { Endorser } from "@/lib/itemEngagement";

const NONE = new Map<string, Endorser[]>();

/**
 * How many people the reader trusts recommend each of many items — what
 * search shows at once: the items' endorsements in one batch
 * (services/itemEngagement), counted the way every endorsement surface
 * counts them (services/endorsements: people the reader follows, then
 * accounts above the verified line). Signed out, "people you trust" are the
 * verified ones, and the words say so.
 */
export function useTrustedRecommenders(items: readonly { id: string; address: string | null }[]) {
  const ids = items.map((i) => i.id);
  // The ids name the items; the addresses are what the ids are of.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const reactions = useQuery({
    queryKey: ["items-reactions", ...ids],
    queryFn: () => fetchItemsReactions([...items]),
    enabled: items.length > 0,
    staleTime: 60_000,
  });
  const byItem = reactions.data ?? NONE;
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
