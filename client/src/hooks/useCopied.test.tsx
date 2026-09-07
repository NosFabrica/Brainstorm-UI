/**
 * The copy→check feedback every copy button does by hand: copy the text,
 * show the check for a moment, go back. One hook so the timer is cleared
 * on unmount and the dance is written once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const copyMock = vi.fn(async (_text: string) => true);
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (text: string) => copyMock(text) }));

import { useCopied } from "./useCopied";

describe("useCopied", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    copyMock.mockReset();
    copyMock.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies the text and shows copied, then lets go after the moment passes", async () => {
    const { result } = renderHook(() => useCopied(1500));
    expect(result.current.copied).toBe(false);
    await act(async () => {
      await result.current.copy("me@wallet.com");
    });
    expect(copyMock).toHaveBeenCalledWith("me@wallet.com");
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.copied).toBe(false);
  });

  it("a copy the browser refused never claims success", async () => {
    copyMock.mockResolvedValue(false);
    const { result } = renderHook(() => useCopied());
    let ok = true;
    await act(async () => {
      ok = await result.current.copy("x");
    });
    expect(ok).toBe(false);
    expect(result.current.copied).toBe(false);
  });

  it("unmounting mid-moment clears the timer", async () => {
    const { result, unmount } = renderHook(() => useCopied());
    await act(async () => {
      await result.current.copy("x");
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
