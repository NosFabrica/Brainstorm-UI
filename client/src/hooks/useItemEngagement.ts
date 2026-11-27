import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { signingProblem } from "@/accounts/signing";
import { coordinateOf } from "@/lib/dlistFields";
import {
  fetchGitHubClaimantProfiles,
  itemReactionFilters,
  publishEndorsement,
  readItemReactions,
} from "@/services/itemEngagement";
import { endorsersOf, githubClaimantsOf } from "@/lib/itemEngagement";

type ItemEvent = { id: string; kind: number; pubkey: string; tags: string[][] };

/**
 * What the network says about a list item, for its page: who endorsed the
 * listing (kind-7 reactions), and — for a GitHub account — which Nostr
 * profiles claim the handle. Read from the EventStore while the relays are
 * asked (docs/adr/0005): the reader's own endorsement shows the moment it is
 * published, and a reaction or claim arriving late still shows.
 */
export function useItemEngagement(item: ItemEvent, githubHandle: string | null) {
  const address = coordinateOf(item);
  // The id and address name the item; the rest of the event is what they are of.
  const filters = useMemo(() => itemReactionFilters(item), [item.id, address]); // eslint-disable-line react-hooks/exhaustive-deps
  const reactions = useStoreEvents(
    `item-reactions:${item.id}:${address ?? ""}`,
    filters,
    () => readItemReactions(item),
    {
      minMs: 60_000,
    },
  );
  const endorsers = useMemo(() => endorsersOf(reactions.events), [reactions.events]);

  // A claim is an `i` tag on someone's kind 0, matched in any case: no store
  // filter can say that, so the claimants are the ask's own profiles, held as
  // the store keeps them (useStoreEvents drops any it has since replaced).
  const handle = githubHandle?.trim().toLowerCase() || null;
  const claims = useStoreEvents(
    handle ? `github-claimants:${handle}` : null,
    null,
    () => fetchGitHubClaimantProfiles(handle!),
    { minMs: 5 * 60_000 },
  );
  const claimants = useMemo(() => (handle ? githubClaimantsOf(claims.events, handle) : []), [claims.events, handle]);
  return {
    endorsers,
    claimants,
    pending: !reactions.settled || (!!handle && !claims.settled),
  };
}

/**
 * Endorsing the item: one signed "+" (services/itemEngagement). On success
 * the reader joins the endorsers on screen at once — the store holds it —
 * without waiting for a relay to echo it; a signing problem is told in a toast, a cancelled
 * signature silently.
 */
export function useEndorseItem(item: ItemEvent) {
  const { toast } = useToast();
  return useMutation({
    // The signed reaction lands in the store once a relay takes it (services/tags), and shows from there.
    mutationFn: () => publishEndorsement(item),
    onError: (error) => {
      const description = signingProblem(error, "Check your connection and try again.");
      if (description) toast({ title: "Couldn't endorse that", description, variant: "destructive" });
    },
  });
}
