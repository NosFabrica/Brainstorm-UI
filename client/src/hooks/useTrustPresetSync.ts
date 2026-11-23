import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { presetFromBackend, presetToBackend, setActivePreset, type TrustPreset } from "@/services/trustThreshold";

export const TRUST_PRESET_QUERY_BASE = "/user/graperank/preset";

export function trustPresetQueryKey(pubkey?: string | null) {
  return [TRUST_PRESET_QUERY_BASE, pubkey ?? null] as const;
}

// Reads whose verified counts / tiers the server derives from the observer's
// saved preset. The preset lives on the server, not in these query keys, so a
// preset write must invalidate them by hand (nothing auto-refetches here).
// `share-conn` qualifies: ConnectionListPage drops `house` on personalized POV.
const PRESET_DRIVEN_QUERY_BASES = new Set([
  "/user/overview",
  "/user/stats",
  "/user/connections",
  "profile-conn",
  "share-conn",
]);

/**
 * A read made from Brainstorm's perspective, which answers under the house's
 * preset whatever the viewer saved — so their preset changing can't move it.
 * Shared-link pages ask these for every viewer, and refetching them on a
 * preset change was pure cost. Each base says it its own way:
 * services/queries/userReads puts the resolved perspective third, useSelf's
 * connections a `house` flag last, ConnectionListPage `myPov` fifth.
 */
function isHouseRead(key: readonly unknown[]): boolean {
  switch (key[0]) {
    case "/user/overview":
    case "/user/stats":
      return key[2] === "house";
    case "/user/connections":
      return key[7] === true;
    case "share-conn":
      return key[4] === false;
    default:
      return false;
  }
}

export function invalidatePresetDrivenReads(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: (query) => PRESET_DRIVEN_QUERY_BASES.has(query.queryKey[0] as string) && !isHouseRead(query.queryKey),
  });
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
    mutationFn: (preset: TrustPreset) => apiClient.setGrapeRankPreset(presetToBackend(preset)),
    onMutate: opts?.onMutate,
    onSuccess: (_data, preset) => {
      setActivePreset(preset);
      const key = trustPresetQueryKey(opts?.pubkey);
      // The server's answer is what we just wrote; no need to ask it again.
      queryClient.setQueryData(key, { data: { preset: presetToBackend(preset) } });
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
  const pubkey = useActiveAccountDisplay()?.pubkey ?? null;
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
