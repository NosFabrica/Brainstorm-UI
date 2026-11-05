import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const fetchMock = vi.fn(async (addresses: string[]) => new Map(addresses.map((a) => [a, { going: 1, faces: [] }])));
vi.mock("@/services/search", () => ({ fetchEventRsvps: (addresses: string[]) => fetchMock(addresses) }));

import { RSVP_SETTLE_MS, useEventRsvps } from "./useEventRsvps";

describe("useEventRsvps", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks once for the list a burst of results settles on", async () => {
    const { result, rerender } = renderHook(({ addrs }) => useEventRsvps(addrs), {
      initialProps: { addrs: ["31923:a:1"] },
    });
    rerender({ addrs: ["31923:a:1", "31923:b:2"] });
    rerender({ addrs: ["31923:a:1", "31923:b:2", "31923:c:3"] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RSVP_SETTLE_MS);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(["31923:a:1", "31923:b:2", "31923:c:3"]);
    expect(result.current.get("31923:c:3")?.going).toBe(1);
  });

  it("asks nothing for no events, and clears what it held", async () => {
    const { result, rerender } = renderHook(({ addrs }) => useEventRsvps(addrs), {
      initialProps: { addrs: ["31923:a:1"] },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RSVP_SETTLE_MS);
    });
    rerender({ addrs: [] });
    expect(result.current.size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops an answer for a list it has moved on from", async () => {
    let resolveOld: (m: Map<string, { going: number; faces: string[] }>) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)));
    const { result, rerender } = renderHook(({ addrs }) => useEventRsvps(addrs), {
      initialProps: { addrs: ["31923:old:1"] },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RSVP_SETTLE_MS);
    });
    rerender({ addrs: [] });
    await act(async () => {
      resolveOld(new Map([["31923:old:1", { going: 9, faces: [] }]]));
    });
    expect(result.current.size).toBe(0);
  });
});
