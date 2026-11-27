import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import type { SearchHit, SearchTab } from "@/services/search";

const statusesMock = vi.fn();
const commentsMock = vi.fn();
const goalsMock = vi.fn();
vi.mock("@/services/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/search")>()),
  fetchGitStatuses: (items: unknown[]) => statusesMock(items),
  fetchGitCommentCounts: (ids: string[]) => commentsMock(ids),
  fetchGoalProgress: (ids: string[], timeout: unknown, closes: ReadonlyMap<string, number>) => goalsMock(ids, closes),
}));

import { useGitItemAsks } from "./useGitItemAsks";
import { useGoalProgress } from "./useGoalProgress";

const ev = (id: string, kind: number, tags: string[][] = []): NostrEvent => ({
  id,
  pubkey: "a".repeat(64),
  created_at: 1,
  kind,
  tags,
  content: "",
  sig: "",
});
const hit = (e: NostrEvent): SearchHit => ({ event: e, author: null, rank: null });

beforeEach(() => {
  statusesMock.mockReset().mockResolvedValue(new Map());
  commentsMock.mockReset().mockResolvedValue(new Map());
  goalsMock.mockReset().mockResolvedValue({ byGoal: new Map(), complete: false });
});

describe("useGitItemAsks", () => {
  it("asks after the items a page adds, not the whole page again, and only on Issues and PRs", async () => {
    const one = hit(ev("1", 1621));
    const two = hit(ev("2", 1621));
    statusesMock.mockResolvedValue(new Map([["1", { kind: 1632, at: 5 }]]));
    commentsMock.mockResolvedValue(new Map([["1", 3]]));
    const { result, rerender } = renderHook(({ hits, tab }) => useGitItemAsks(hits, tab), {
      initialProps: { hits: [one], tab: "issues" as SearchTab },
    });
    await waitFor(() => expect(result.current.gitComments.get("1")).toBe(3));
    expect(result.current.gitStatuses.get("1")).toEqual({ kind: 1632, at: 5 });
    expect(statusesMock).toHaveBeenLastCalledWith([one.event]);
    rerender({ hits: [one, two], tab: "issues" });
    await waitFor(() => expect(commentsMock).toHaveBeenLastCalledWith(["2"]));
    rerender({ hits: [one, two], tab: "notes" });
    await waitFor(() => expect(result.current.gitStatuses.size).toBe(0));
    expect(statusesMock).toHaveBeenCalledTimes(2);
  });
});

describe("useGoalProgress", () => {
  it("knows a goal's progress once asked, and a complete answer's silence as nothing raised", async () => {
    const goal = hit(ev("g1", 9041, [["closed_at", "100"]]));
    const quiet = hit(ev("g2", 9041));
    goalsMock.mockResolvedValue({ byGoal: new Map([["g1", { sats: 21, zappers: [] }]]), complete: true });
    const { result } = renderHook(() => useGoalProgress([goal, quiet], "fundraisers"));
    await waitFor(() => expect(result.current(goal.event)).toEqual({ sats: 21, zappers: [] }));
    expect(result.current(quiet.event)).toEqual({ sats: 0, zappers: [] });
    expect(goalsMock.mock.calls[0][1].get("g1")).toBe(100);
    expect(result.current(ev("n", 1))).toBeUndefined();
  });
});
