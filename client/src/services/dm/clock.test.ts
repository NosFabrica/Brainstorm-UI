// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeClock } from "./clock";

afterEach(() => vi.useRealTimers());

describe("makeClock", () => {
  it("runs on the deps' own functions where given", () => {
    const set = vi.fn(() => "t");
    const clear = vi.fn();
    const repeat = vi.fn(() => "r");
    const clearRepeat = vi.fn();
    const clock = makeClock({
      now: () => 42,
      clockMs: () => 42_000,
      setTimer: set,
      clearTimer: clear,
      setRepeating: repeat,
      clearRepeating: clearRepeat,
    });
    const fn = () => {};
    expect(clock.now()).toBe(42);
    expect(clock.ms()).toBe(42_000);
    expect(clock.set(fn, 10)).toBe("t");
    expect(set).toHaveBeenCalledWith(fn, 10);
    clock.clear("t");
    expect(clear).toHaveBeenCalledWith("t");
    expect(clock.repeat(fn, 60_000)).toBe("r");
    clock.clearRepeat("r");
    expect(clearRepeat).toHaveBeenCalledWith("r");
  });

  it("falls back to the platform's", () => {
    vi.useFakeTimers({ now: 1_700_000_000_500 });
    const clock = makeClock({});
    expect(clock.now()).toBe(1_700_000_000);
    expect(clock.ms()).toBe(1_700_000_000_500);
    const fired: string[] = [];
    const once = clock.set(() => fired.push("once"), 100);
    clock.set(() => fired.push("kept"), 100);
    clock.clear(once);
    const every = clock.repeat(() => fired.push("tick"), 50);
    vi.advanceTimersByTime(100);
    clock.clearRepeat(every);
    vi.advanceTimersByTime(100);
    expect(fired.sort()).toEqual(["kept", "tick", "tick"]);
  });
});
