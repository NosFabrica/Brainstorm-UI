import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { apiClient } from "@/services/api";
import { signingProblem } from "@/accounts/signing";
import { fetchGitHubClaimants, fetchItemReactions, publishEndorsement } from "@/services/itemEngagement";
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

/**
 * Endorsing the item: one signed "+" (services/itemEngagement). On success
 * the reader joins the endorsers on screen at once, without waiting for a
 * relay to echo it; a signing problem is told in a toast, a cancelled
 * signature silently.
 */
export function useEndorseItem(item: ItemEvent) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: () => publishEndorsement(item),
    onSuccess: (mine) => {
      qc.setQueryData<Endorser[]>(["item-reactions", item.id], (prev) => [
        mine,
        ...(prev ?? []).filter((e) => e.pubkey !== mine.pubkey),
      ]);
    },
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't endorse that", description, variant: "destructive" });
    },
  });
}

/**
 * How far the lister is from the reader in the follows graph, from the
 * server's shortest path (the key the profile's degree chip uses, so the two
 * share one answer). Null while unknown, for a visitor, for the reader's own
 * listing, or when unreachable.
 */
export function useListerDistance(lister: string): { hops: number | null } {
  const me = useActiveAccountDisplay()?.pubkey ?? null;
  const enabled = !!me && me !== lister;
  const query = useQuery({
    queryKey: ["shortestHops", me, lister],
    queryFn: () => apiClient.getShortestHops({ from: me!, to: lister }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const hops = query.data?.hops;
  return { hops: enabled && typeof hops === "number" && hops > 0 ? hops : null };
}
