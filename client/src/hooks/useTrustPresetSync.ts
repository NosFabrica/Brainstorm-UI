import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";
import { presetFromBackend, setActivePreset, type TrustPreset } from "@/services/trustThreshold";

export const TRUST_PRESET_QUERY_BASE = "/user/graperank/preset";

export function trustPresetQueryKey(pubkey?: string | null) {
  return [TRUST_PRESET_QUERY_BASE, pubkey ?? null] as const;
}

export function useTrustPresetSync(enabled: boolean): {
  preset: TrustPreset | null;
  isLoading: boolean;
} {
  const pubkey = getCurrentUser()?.pubkey ?? null;
  const query = useQuery({
    queryKey: trustPresetQueryKey(pubkey),
    queryFn: () => apiClient.getGrapeRankPreset(),
    enabled: enabled && !!pubkey,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const serverPreset = query.data?.data?.preset;
  const preset = serverPreset ? presetFromBackend(serverPreset) : null;

  useEffect(() => {
    if (preset) setActivePreset(preset);
  }, [preset]);

  return { preset, isLoading: query.isPending && enabled };
}
