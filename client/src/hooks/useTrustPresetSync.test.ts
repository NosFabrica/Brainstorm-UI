/**
 * Changing the trust preset is a server-side write, so the reads it reshapes
 * have to be invalidated by hand — nothing about the preset is in their query
 * keys, and the default query options never auto-refetch.
 *
 * Issue: .scratch/preset-verified-counts/issues/04-frontend-render-backend-truth.md
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { apiClient } from "@/services/api";
import {
  invalidatePresetDrivenReads,
  trustPresetQueryKey,
  useSetTrustPreset,
} from "@/hooks/useTrustPresetSync";

const PK = "a".repeat(64);

afterEach(() => vi.restoreAllMocks());

function clientWithFreshQueries(keys: unknown[][]): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  for (const key of keys) queryClient.setQueryData(key, { seeded: true });
  return queryClient;
}

const isStale = (queryClient: QueryClient, key: unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe("invalidatePresetDrivenReads", () => {
  it("invalidates every read whose verified counts the preset drives", () => {
    const keys = [
      ["/user/overview", PK],
      ["/user/stats", PK],
      ["/user/connections", PK, "muted_by", "desc", null, false, true],
      ["profile-overview", PK, "default"],
      ["profile-stats", PK, "default"],
      ["profile-conn", PK, "reported_by", "default", "desc", null, false],
      // Personalized POV on /p/:id/:type sends the token, so this one moves too.
      ["share-conn", PK, "followed_by", "followers", true, "all", "desc"],
    ];
    const queryClient = clientWithFreshQueries(keys);

    invalidatePresetDrivenReads(queryClient);

    for (const key of keys) expect(isStale(queryClient, key)).toBe(true);
  });

  it("leaves the share page alone — it fetches the house perspective", () => {
    // These always fetch with `house: true`, so they read the same for every
    // viewer and never move with the viewer's own preset.
    const shareKeys = [
      ["share-stats", PK],
      ["share-followedby", PK],
    ];
    const queryClient = clientWithFreshQueries(shareKeys);

    invalidatePresetDrivenReads(queryClient);

    for (const key of shareKeys) expect(isStale(queryClient, key)).toBe(false);
  });

  it("leaves unrelated caches alone", () => {
    const queryClient = clientWithFreshQueries([["nostr-profile", PK]]);

    invalidatePresetDrivenReads(queryClient);

    expect(isStale(queryClient, ["nostr-profile", PK])).toBe(false);
  });
});

describe("useSetTrustPreset", () => {
  function renderIt(queryClient: QueryClient) {
    return renderHook(() => useSetTrustPreset({ pubkey: PK }), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    });
  }

  it("persists the preset to the server in the backend's vocabulary", async () => {
    // The picker is a real account setting, not a client-side filter.
    const spy = vi
      .spyOn(apiClient, "setGrapeRankPreset")
      .mockResolvedValue({ data: { preset: "RESTRICTIVE" } });
    const queryClient = clientWithFreshQueries([]);

    const { result } = renderIt(queryClient);
    result.current.mutate("strict");

    await waitFor(() => expect(spy).toHaveBeenCalledWith("RESTRICTIVE"));
  });

  it("refreshes the reads that render under the preset once it saves", async () => {
    vi.spyOn(apiClient, "setGrapeRankPreset").mockResolvedValue({
      data: { preset: "RESTRICTIVE" },
    });
    const queryClient = clientWithFreshQueries([
      ["/user/stats", PK],
      ["profile-conn", PK, "muted_by"],
    ]);

    const { result } = renderIt(queryClient);
    result.current.mutate("strict");

    await waitFor(() => {
      expect(isStale(queryClient, ["/user/stats", PK])).toBe(true);
      expect(isStale(queryClient, ["profile-conn", PK, "muted_by"])).toBe(true);
    });
    // And the server's answer is seeded, so the UI doesn't flicker back.
    expect(queryClient.getQueryData(trustPresetQueryKey(PK))).toEqual({
      data: { preset: "RESTRICTIVE" },
    });
  });

  it("leaves the reads alone when the save fails", async () => {
    vi.spyOn(apiClient, "setGrapeRankPreset").mockRejectedValue(new Error("nope"));
    const queryClient = clientWithFreshQueries([["/user/stats", PK]]);

    const { result } = renderIt(queryClient);
    result.current.mutate("strict");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isStale(queryClient, ["/user/stats", PK])).toBe(false);
  });
});
