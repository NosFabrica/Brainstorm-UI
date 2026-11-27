// @vitest-environment jsdom
/** The header's whole-table reads: shown in batches the first time, swapped in whole after. */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({
  getAdminUsers: vi.fn(async () => ({ items: [], total: 0, pages: 1 })),
  getAdminActivity: vi.fn(),
}));
vi.mock("@/services/api", () => ({ apiClient: api }));

import { useAdminHeaderMetrics } from "./useAdminHeaderMetrics";

type Page = { items: number[]; total: number; pages: number };
const PAGES = 25;

describe("useAdminHeaderMetrics", () => {
  it("streams a first load, then replaces the whole result on a refetch instead of dropping to partial", async () => {
    // Pages 12.. wait on a gate, so the second batch is still out when we look.
    let gate!: () => void;
    let opened = new Promise<void>((r) => (gate = r));
    api.getAdminActivity.mockImplementation(async ({ page }: { page: number }) => {
      if (page > 11) await opened;
      return { items: Array.from({ length: 100 }, (_, i) => page * 1000 + i), total: PAGES * 100, pages: PAGES };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useAdminHeaderMetrics<Page, Page>({
          rangeDays: 7,
          allUsers: { enabled: false, refetchInterval: false },
          activity: { enabled: true, refetchInterval: false },
        }),
      { wrapper },
    );

    // First load: the first 11 pages show before the rest arrive.
    await waitFor(() => expect(result.current.overviewActivityQuery.data?.items.length).toBe(1100));
    await act(async () => gate());
    await waitFor(() => expect(result.current.overviewActivityQuery.data?.items.length).toBe(PAGES * 100));

    // A poll: the complete answer stays until the new one is whole.
    opened = new Promise<void>((r) => (gate = r));
    const seen: number[] = [];
    const unsubscribe = client.getQueryCache().subscribe(() => {
      const data = client.getQueryData<Page>(["/api/admin/activity/overview", 7]);
      if (data) seen.push(data.items.length);
    });
    let refetch!: Promise<unknown>;
    act(() => {
      refetch = result.current.overviewActivityQuery.refetch();
    });
    await new Promise((r) => setTimeout(r, 20));
    await act(async () => {
      gate();
      await refetch;
    });
    unsubscribe();
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.min(...seen)).toBe(PAGES * 100);
  });
});
