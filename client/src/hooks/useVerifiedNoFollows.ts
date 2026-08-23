import { useQuery } from "@tanstack/react-query";
import { fetchContactList } from "@/services/socialActions";
import { fetchOutboxRelayList } from "@/services/nostr";
import { knownFollowCount, recordFollowList } from "@/lib/followStore";
import { identityHas } from "@/accounts/display";

export type NoFollowsVerification = "checking" | "none" | "has-follows";

/**
 * "This user follows nobody" verified against relays, not just the cold local
 * floor. The no-follows surfaces (dashboard picker card, home-page nudge,
 * thread nudge) used to fire on `knownFollowCount` alone — 0 whenever the
 * login-time fetch failed — so users with real follow lists were handed the
 * new-user picker. This hook warms the outbox list (so the read hits their
 * real write relays), fetches the kind-3 once per account, and repairs the
 * floor via `recordFollowList` when a list is found (the floor only grows).
 *
 * Fast paths: a floor > 0 answers "has-follows" with no network; a key minted
 * in this app answers "none" — it cannot have a prior list, and even if this
 * is ever wrong the follow publish merges onto the relay base, so the worst
 * case is a redundant picker, never a wipe.
 *
 * A fetch that finds nothing (or errors) settles on "none": hiding onboarding
 * forever on a flaky network is worse than showing the picker, because the
 * commit-time guard in `followPubkeys` is the backstop for the relays-down
 * case.
 */
export function useVerifiedNoFollows(pubkey: string | null | undefined): NoFollowsVerification {
  const floor = pubkey ? knownFollowCount(pubkey) : 0;
  const mintedHere = !!pubkey && identityHas(pubkey, "createdInApp");
  const needsCheck = !!pubkey && floor === 0 && !mintedHere;

  const query = useQuery({
    queryKey: ["verified-no-follows", pubkey],
    enabled: needsCheck,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      try { await fetchOutboxRelayList(pubkey!); } catch { /* best-effort warm */ }
      const ev = await fetchContactList(pubkey!);
      if (ev) {
        recordFollowList(pubkey!, ev as any);
        return "has-follows" as const;
      }
      return "none" as const;
    },
  });

  if (!pubkey) return "checking";
  if (floor > 0) return "has-follows";
  if (mintedHere) return "none";
  if (query.data) return query.data;
  if (query.isError) return "none";
  return "checking";
}
