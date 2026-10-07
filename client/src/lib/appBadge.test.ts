import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAppBadge, setAppBadge } from "./appBadge";

describe("setAppBadge", () => {
  const set = vi.fn(() => Promise.resolve());
  const clear = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    __resetAppBadge();
    set.mockClear();
    clear.mockClear();
    vi.stubGlobal("navigator", { ...navigator, setAppBadge: set, clearAppBadge: clear });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("puts the count on the icon, and takes it off at zero", () => {
    setAppBadge(3);
    expect(set).toHaveBeenCalledWith(3);
    setAppBadge(0);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("doesn't repeat a count already shown", () => {
    setAppBadge(2);
    setAppBadge(2);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it("does nothing where the browser has no badge, and swallows a refusal", async () => {
    vi.stubGlobal("navigator", { ...navigator });
    expect(() => setAppBadge(1)).not.toThrow();
    vi.stubGlobal("navigator", { ...navigator, setAppBadge: () => Promise.reject(new Error("denied")) });
    expect(() => setAppBadge(4)).not.toThrow();
  });
});
