import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { getCurrentUser } from "@/services/nostr";
import {
  presetFromBackend,
  presetToBackend,
  setActivePreset,
  type TrustPreset,
} from "@/services/trustThreshold";

export const TRUST_PRESET_QUERY_BASE = "/user/graperank/preset";

export function trustPresetQueryKey(pubkey?: string | null) {
  return [TRUST_PRESET_QUERY_BASE, pubkey ?? null] as const;
}

// Reads whose verified counts / tiers the server derives from the observer's
// saved preset. The preset lives on the server, not in these query keys, so a
// preset write must invalidate them by hand (nothing auto-refetches here).
// `share-conn` qualifies: ConnectionListPage drops `house` on personalized POV.
// `share-stats` / `share-followedby` don't — always `house: true`, so a shared
// link never moves with the viewer's preset.
const PRESET_DRIVEN_QUERY_BASES = [
  "/user/overview",
  "/user/stats",
  "/user/connections",
  "profile-overview",
  "profile-stats",
  "profile-conn",
  "share-conn",
];

export function invalidatePresetDrivenReads(queryClient: QueryClient): void {
  for (const base of PRESET_DRIVEN_QUERY_BASES) {
    queryClient.invalidateQueries({ queryKey: [base] });
  }
}

/**
 * Write the preset to the server, then make every view that renders under it
 * reload. The caller owns its own optimistic state and toasts.
 */
export function useSetTrustPreset(opts?: {
  pubkey?: string | null;
  onSettledOk?: (preset: TrustPreset) => void;
  onMutate?: (preset: TrustPreset) => unknown;
  onError?: (error: unknown, preset: TrustPreset, context: unknown) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preset: TrustPreset) =>
      apiClient.setGrapeRankPreset(presetToBackend(preset)),
    onMutate: opts?.onMutate,
    onSuccess: (_data, preset) => {
      setActivePreset(preset);
      const key = trustPresetQueryKey(opts?.pubkey);
      queryClient.setQueryData(key, { data: { preset: presetToBackend(preset) } });
      queryClient.invalidateQueries({ queryKey: key });
      invalidatePresetDrivenReads(queryClient);
      opts?.onSettledOk?.(preset);
    },
    onError: opts?.onError,
  });
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
