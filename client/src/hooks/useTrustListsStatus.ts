import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { checkUserLists, type UserLists } from "@/services/trustLists";

/**
 * Whether the user has Trusted Lists their 10040 doesn't point to yet — the
 * onboarding flow asks them to publish their Treasure Map again when it's
 * "missing". Only once they have an assistant (`taPubkey`).
 */
export function useTrustListsStatus(
  pubkey: string | null | undefined,
  taPubkey: string | null | undefined,
): UseQueryResult<UserLists> {
  return useQuery({
    queryKey: ["trust-lists-status", pubkey, taPubkey],
    queryFn: () => checkUserLists(pubkey!, taPubkey!),
    enabled: !!pubkey && !!taPubkey,
    retry: 1,
    staleTime: Infinity,
  });
}
