// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { SearchTag } from "@/services/searchTags";

const fetchMock = vi.fn<(q: string, lens: unknown, opts?: unknown) => Promise<SearchTag[]>>();
vi.mock("@/services/searchTags", () => ({
  fetchSearchTags: (q: string, lens: unknown, opts?: unknown) => fetchMock(q, lens, opts),
}));

import { useSearchTags } from "./useSearchTags";

const AUTHOR = "9".repeat(64);
const pk = (c: string) => c.repeat(64);
const tag = (slug: string, members: Array<[string, string | null]>): SearchTag => ({
  key: `${AUTHOR}|${slug}`,
  authorPubkey: AUTHOR,
  slug,
  name: slug,
  people: members.length,
  vouches: members.length,
  sharesName: 1,
  unverified: false,
  members: members.map(([c, name]) => ({
    pubkey: pk(c),
    endorsements: 2,
    disputes: 0,
    score: 50,
    ...(name ? { profile: { pubkey: pk(c), npub: `npub${c}`, name } } : {}),
  })),
});
const settle = () => act(async () => {});

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("useSearchTags", () => {
  it("answers with the tags the words matched, capped, and who carries them", async () => {
    fetchMock.mockResolvedValue([
      tag("aos", [
        ["a", "AJ"],
        ["b", "Tanja"],
      ]),
      tag("developer", [["a", "AJ"]]),
      tag("devrel", []),
    ]);
    const { result } = renderHook(() => useSearchTags("aos", { pov: "nosfabrica", max: 2, members: true }));
    expect(result.current.settled).toBe(false);
    await settle();

    expect(result.current.settled).toBe(true);
    expect(result.current.tags.map((t) => t.slug)).toEqual(["aos", "developer"]);
    // Every carrier once, tag by tag, in the relay's order.
    expect(result.current.carriers.people.map((p) => p.name)).toEqual(["AJ", "Tanja"]);
    expect(result.current.carriers.byPubkey.get(pk("a"))?.map((t) => t.slug)).toEqual(["aos", "developer"]);
    expect(result.current.carriers.settled).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("aos", { pov: "nosfabrica", userPubkey: undefined }, { members: true });
  });

  it("leaves out a member the relay sent no profile for — a row needs a name", async () => {
    fetchMock.mockResolvedValue([
      tag("aos", [
        ["a", null],
        ["b", "Tanja"],
      ]),
    ]);
    const { result } = renderHook(() => useSearchTags("aos", { pov: "nosfabrica", members: true }));
    await settle();
    expect(result.current.carriers.people.map((p) => p.name)).toEqual(["Tanja"]);
  });

  it("waits for a pause in the typing, and asks only for where the words came to rest", async () => {
    const { rerender } = renderHook(({ q }) => useSearchTags(q, { pov: "nosfabrica", pauseMs: 250 }), {
      initialProps: { q: "ao" },
    });
    act(() => void vi.advanceTimersByTime(100));
    rerender({ q: "aos" });
    act(() => void vi.advanceTimersByTime(249));
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    await settle();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["aos"]);
  });

  it("drops an answer for words the reader has moved on from", async () => {
    let answerAos: (tags: SearchTag[]) => void = () => {};
    fetchMock.mockImplementation((q) =>
      q === "aos" ? new Promise((r) => (answerAos = r)) : Promise.resolve([tag("developer", [])]),
    );
    const { result, rerender } = renderHook(({ q }) => useSearchTags(q, { pov: "nosfabrica" }), {
      initialProps: { q: "aos" },
    });
    await settle();
    rerender({ q: "developer" });
    await settle();
    await act(async () => answerAos([tag("aos", [])]));
    expect(result.current.tags.map((t) => t.slug)).toEqual(["developer"]);
  });

  it("asks nothing, and says so at once, for words too short to match", async () => {
    const { result } = renderHook(() => useSearchTags("", { pov: "nosfabrica" }));
    await settle();
    expect(result.current).toMatchObject({ tags: [], settled: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
