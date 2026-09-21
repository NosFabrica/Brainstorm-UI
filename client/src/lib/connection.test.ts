// @vitest-environment jsdom
/** How constrained the device says its network is — read from the browser, never chosen. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectionSpeed, __resetConnectionSpeed } from "./connection";

type FakeConnection = { saveData?: boolean; effectiveType?: string; addEventListener: (t: string, fn: () => void) => void; removeEventListener: (t: string, fn: () => void) => void };

function stubConnection(initial: { saveData?: boolean; effectiveType?: string } | null) {
  const listeners = new Set<() => void>();
  const connection: FakeConnection | undefined = initial
    ? {
        ...initial,
        addEventListener: (_t, fn) => void listeners.add(fn),
        removeEventListener: (_t, fn) => void listeners.delete(fn),
      }
    : undefined;
  Object.defineProperty(window.navigator, "connection", { value: connection, configurable: true });
  __resetConnectionSpeed();
  return {
    change(next: { saveData?: boolean; effectiveType?: string }) {
      Object.assign(connection!, next);
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  __resetConnectionSpeed();
});
afterEach(() => {
  Object.defineProperty(window.navigator, "connection", { value: undefined, configurable: true });
  vi.restoreAllMocks();
});

describe("connectionSpeed", () => {
  it("is normal where the browser doesn't say", () => {
    stubConnection(null);
    expect(connectionSpeed()).toBe("normal");
  });

  it.each([
    ["4g", "normal"],
    ["3g", "slow"],
    ["2g", "very-slow"],
    ["slow-2g", "very-slow"],
  ])("reads %s as %s", (effectiveType, expected) => {
    stubConnection({ effectiveType });
    expect(connectionSpeed()).toBe(expected);
  });

  it("treats an explicit data-saver request as very slow, whatever the speed", () => {
    stubConnection({ effectiveType: "4g", saveData: true });
    expect(connectionSpeed()).toBe("very-slow");
  });

  it("follows the connection as it changes", () => {
    const conn = stubConnection({ effectiveType: "4g" });
    expect(connectionSpeed()).toBe("normal");
    conn.change({ effectiveType: "2g" });
    expect(connectionSpeed()).toBe("very-slow");
    conn.change({ effectiveType: "3g" });
    expect(connectionSpeed()).toBe("slow");
  });
});
