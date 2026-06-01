import { useQuery } from "@tanstack/react-query";
import { apiClient, hasSessionToken } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";

export function useHasMywot(): { hasMywot: boolean; taPubkey: string | null } {
  const user = getCurrentUser();
  // Only probe /user/self when there is a real session token. getSelf() uses
  // authenticatedFetch, which on 401 wipes storage and hard-redirects to "/".
  // Gating on a stale `nostr_user` alone (which getCurrentUser() accepts) would
  // let that redirect hijack anonymous/public flows when the token is missing
  // or expired, so we require the token to be present.
  const { data } = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user && hasSessionToken(),
    staleTime: 60_000,
  });
  const taPubkey: string | null = data?.data?.history?.ta_pubkey ?? null;
  return { hasMywot: !!taPubkey, taPubkey };
}
