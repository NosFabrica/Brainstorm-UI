// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { queryWrapper } from "@/test/utils";

const getUserConnections = vi.hoisted(() =>
  vi.fn(async (_pk: string, kind: string) => ({
    data: { items: [{ pubkey: `${kind}-1`, influence: 0.5 }], next_cursor: null },
  })),
);
vi.mock("@/services/api", () => ({ apiClient: { getUserConnections } }));

import { useProfileConnections } from "./profileConnections";

describe("useProfileConnections", () => {
  it("hands back the same flattened rows on every render until a page lands", async () => {
    const { result, rerender } = renderHook(() => useProfileConnections("p".repeat(64), {}, {}, {}), {
      wrapper: queryWrapper(),
    });
    await waitFor(() => expect(result.current.items.followed_by).toHaveLength(1));
    const first = result.current.items;
    rerender();
    rerender();
    expect(result.current.items.followed_by).toBe(first.followed_by);
    expect(result.current.items.following).toBe(first.following);
    // The lazy sections ask nothing until they open.
    expect(result.current.items.muted_by).toBeNull();
    expect(getUserConnections.mock.calls.map(([, kind]) => kind).sort()).toEqual(["followed_by", "following"]);
  });

  it("asks a section for its sort and filter", async () => {
    getUserConnections.mockClear();
    renderHook(() => useProfileConnections("p".repeat(64), { following: "trust-asc" }, { following: "trusted" }, {}), {
      wrapper: queryWrapper(),
    });
    await waitFor(() =>
      expect(getUserConnections).toHaveBeenCalledWith(
        "p".repeat(64),
        "following",
        expect.objectContaining({ order: "asc", tier: "medium_high" }),
      ),
    );
  });
});
