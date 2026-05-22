import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";

export function useHasMywot(): { hasMywot: boolean; taPubkey: string | null } {
  const user = getCurrentUser();
  const { data } = useQuery({
    queryKey: ["/api/auth/self"],
    queryFn: () => apiClient.getSelf(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const taPubkey: string | null = data?.data?.history?.ta_pubkey ?? null;
  return { hasMywot: !!taPubkey, taPubkey };
}
