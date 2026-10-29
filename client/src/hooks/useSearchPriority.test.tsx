// @vitest-environment jsdom
/**
 * Whether the Top page's own results have answered, so the previews' row-ordering lookups may ask
 * (hooks/useSearchPriority): once the people section has answered — results or an error — or after
 * a few seconds whatever it's doing, so a stalled section never holds them back; afresh for each
 * search; and always, off the Top page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSearchPriorityState } from "./useSearchPriority";

type Snap = { eose: boolean; error: string | null; hits: unknown[]; timeMs: number | null } | null;
const pending: Snap = { eose: false, error: null, hits: [], timeMs: null };
const answered: Snap = { eose: true, error: null, hits: [], timeMs: 900 };
const failed: Snap = { eose: false, error: "relay down", hits: [], timeMs: null };

const run = (initial: { top: boolean; people: Snap; query: string }) =>
  renderHook(
    (p: { top: boolean; people: Snap; query: string }) => useSearchPriorityState(p.top, p.people as never, p.query),
    {
      initialProps: initial,
    },
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useSearchPriorityState", () => {
  it("waits on the Top page until the people have answered", () => {
    const { result, rerender } = run({ top: true, people: pending, query: "west" });
    expect(result.current).toBe(false);
    rerender({ top: true, people: answered, query: "west" });
    expect(result.current).toBe(true);
  });

  it("an error is an answer too", () => {
    const { result } = run({ top: true, people: failed, query: "west" });
    expect(result.current).toBe(true);
  });

  it("stops waiting after a few seconds, whatever the people section is doing", () => {
    const { result } = run({ top: true, people: pending, query: "west" });
    act(() => vi.advanceTimersByTime(3900));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe(true);
  });

  it("waits afresh for a new search", () => {
    const { result, rerender } = run({ top: true, people: answered, query: "west" });
    expect(result.current).toBe(true);
    rerender({ top: true, people: pending, query: "east" });
    expect(result.current).toBe(false);
  });

  // Typing a new search keeps the last one's people on the page for a moment: their answer is not
  // this search's, and must not let the lookups ask in front of it.
  it("doesn't take the last search's answer for this one's", () => {
    const { result, rerender } = run({ top: true, people: answered, query: "west" });
    expect(result.current).toBe(true);
    rerender({ top: true, people: answered, query: "north" });
    expect(result.current).toBe(false);
    rerender({ top: true, people: pending, query: "north" });
    expect(result.current).toBe(false);
    rerender({ top: true, people: { eose: true, error: null, hits: [], timeMs: 700 }, query: "north" });
    expect(result.current).toBe(true);
  });

  it("never waits off the Top page", () => {
    const { result } = run({ top: false, people: null, query: "west" });
    expect(result.current).toBe(true);
  });
});
