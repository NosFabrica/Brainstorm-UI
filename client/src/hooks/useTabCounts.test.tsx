// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { SearchPov, SearchTab } from "@/services/search";

const asks: { query: string; onCount: (tab: SearchTab, n: number | null) => void; cancelled: boolean }[] = [];
vi.mock("@/services/search", () => ({
  countTabs: (query: string, _tabs: unknown, _lens: unknown, onCount: (tab: SearchTab, n: number | null) => void) => {
    const ask = { query, onCount, cancelled: false };
    asks.push(ask);
    return () => {
      ask.cancelled = true;
    };
  },
}));
vi.mock("@/services/searchTags", () => ({ fetchSearchTags: () => Promise.resolve([]) }));

import { __forgetTabCounts, useTabCounts } from "./useTabCounts";

const TABS: SearchTab[] = ["people", "shop"];
type Props = { query: string; ready: boolean; pov?: SearchPov };
const mount = (initial: Props) =>
  renderHook(({ query, ready, pov = "nosfabrica" }: Props) => useTabCounts(query, TABS, { pov, ready }), {
    initialProps: initial,
  });

beforeEach(() => {
  asks.length = 0;
  __forgetTabCounts();
});
afterEach(() => vi.useRealTimers());

describe("useTabCounts", () => {
  it("asks nothing until the page's results have answered, then once", () => {
    const { rerender } = mount({ query: "jack", ready: false });
    expect(asks).toHaveLength(0);
    rerender({ query: "jack", ready: true });
    expect(asks).toHaveLength(1);
    expect(asks[0].query).toBe("jack");
  });

  it("asks anyway once results have taken four seconds", () => {
    vi.useFakeTimers();
    mount({ query: "jack", ready: false });
    act(() => vi.advanceTimersByTime(3999));
    expect(asks).toHaveLength(0);
    act(() => vi.advanceTimersByTime(1));
    expect(asks).toHaveLength(1);
  });

  it("a page going back to waiting — a change of tab — neither cancels the counts nor asks again", () => {
    const { rerender } = mount({ query: "jack", ready: true });
    rerender({ query: "jack", ready: false });
    rerender({ query: "jack", ready: true });
    expect(asks).toHaveLength(1);
    expect(asks[0].cancelled).toBe(false);
  });

  it("new words or a new lens ask afresh, and the last question's counts are dropped", () => {
    const { rerender } = mount({ query: "jack", ready: true });
    rerender({ query: "jill", ready: true });
    expect(asks).toHaveLength(2);
    expect(asks[0].cancelled).toBe(true);
    rerender({ query: "jill", ready: true, pov: "mywot" });
    // "mywot" without a signed-in viewer reads through the house, as search does: the same question.
    expect(asks).toHaveLength(2);
  });

  it("nothing is known until every count is in, and then all at once", () => {
    const { result } = mount({ query: "jack", ready: true });
    act(() => asks[0].onCount("shop", 0));
    expect(result.current.counts).toEqual({});
    act(() => asks[0].onCount("people", 3));
    expect(result.current.counts).toEqual({ shop: 0, people: 3 });
  });

  it("leaving the page cancels the counts still out", () => {
    const { unmount } = mount({ query: "jack", ready: true });
    unmount();
    expect(asks[0].cancelled).toBe(true);
  });

  it("settled counts are remembered for five minutes, then asked again", () => {
    vi.useFakeTimers();
    const first = mount({ query: "jack", ready: true });
    act(() => {
      asks[0].onCount("people", 3);
      asks[0].onCount("shop", 0);
    });
    first.unmount();
    const again = mount({ query: "jack", ready: true });
    expect(asks).toHaveLength(1);
    expect(again.result.current.counts).toEqual({ people: 3, shop: 0 });
    again.unmount();
    vi.advanceTimersByTime(5 * 60_000);
    mount({ query: "jack", ready: true });
    expect(asks).toHaveLength(2);
  });

  it("a query of filters alone asks nothing", () => {
    mount({ query: "sort:recent", ready: true });
    expect(asks).toHaveLength(0);
  });
});
