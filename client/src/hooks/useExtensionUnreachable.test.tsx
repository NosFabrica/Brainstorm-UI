import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useExtensionUnreachable } from "./useExtensionUnreachable";

function installedPhone() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q === "(pointer: coarse)" || q === "(display-mode: standalone)",
  }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as { nostr?: unknown }).nostr;
});

describe("useExtensionUnreachable", () => {
  it("is unreachable in an installed phone app with no extension (Chrome on Android, iOS)", () => {
    installedPhone();
    expect(renderHook(() => useExtensionUnreachable()).result.current).toBe(true);
  });

  it("keeps the extension where one is there, installed or not (Firefox or Edge on Android)", () => {
    installedPhone();
    (window as { nostr?: unknown }).nostr = {};
    expect(renderHook(() => useExtensionUnreachable()).result.current).toBe(false);
  });

  it("brings the extension back when it injects late", async () => {
    vi.useFakeTimers();
    installedPhone();
    const { result } = renderHook(() => useExtensionUnreachable());
    expect(result.current).toBe(true);
    (window as { nostr?: unknown }).nostr = {};
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current).toBe(false);
  });

  it("never applies in a browser tab", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(pointer: coarse)" }));
    expect(renderHook(() => useExtensionUnreachable()).result.current).toBe(false);
  });
});
