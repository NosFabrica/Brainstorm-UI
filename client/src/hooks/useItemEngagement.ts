import { useQuery } from "@tanstack/react-query";
import { fetchGitHubClaimants, fetchItemReactions } from "@/services/itemEngagement";
import type { Endorser, GitHubClaimant } from "@/lib/itemEngagement";

type ItemEvent = { id: string; kind: number; pubkey: string; tags: string[][] };

/**
 * What the network says about a list item, for its page: who endorsed the
 * listing (kind-7 reactions), and — for a GitHub account — which Nostr
 * profiles claim the handle. Relay reads, cached per item for the visit.
 */
export function useItemEngagement(item: ItemEvent, githubHandle: string | null) {
  // The id names the item; the rest of the event is what the id is of.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const reactions = useQuery<Endorser[]>({
    queryKey: ["item-reactions", item.id],
    queryFn: () => fetchItemReactions(item),
    staleTime: 60_000,
  });
  const claimants = useQuery<GitHubClaimant[]>({
    queryKey: ["github-claimants", githubHandle?.toLowerCase() ?? ""],
    queryFn: () => fetchGitHubClaimants(githubHandle!),
    enabled: !!githubHandle,
    staleTime: 5 * 60_000,
  });
  return {
    endorsers: reactions.data ?? [],
    claimants: claimants.data ?? [],
    pending: reactions.isPending || (!!githubHandle && claimants.isPending),
  };
}
