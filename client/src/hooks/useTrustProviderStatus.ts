import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { checkExistingTrustProvider, type TrustProviderStatus } from "@/services/trustAnchor";

/**
 * What the user's on-relay kind-10040 says about their trusted-assertions
 * provider — THE authority every surface must defer to. "brainstorm" also
 * records the local activated flag; "other" (a declaration naming a different
 * assistant — definitive, requires taPubkey) also CLEARS it, so a badge or
 * Settings row can never keep claiming Brainstorm over a foreign declaration.
 * "none"/"unknown" are absence/silence: no downgrade (relays are
 * eventually-consistent; a miss is not a deactivation).
 *
 * Shared by DashboardPage, SettingsPage and UserPanelPage under one query key
 * so they can't disagree with each other.
 */
export function useTrustProviderStatus(
  pubkey: string | null | undefined,
  taPubkey: string | null | undefined,
): UseQueryResult<TrustProviderStatus> {
  return useQuery({
    queryKey: ["trust-provider-status", pubkey, taPubkey],
    queryFn: () => checkExistingTrustProvider(pubkey!, taPubkey),
    enabled: !!pubkey && !!taPubkey,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: Infinity,
  });
}
