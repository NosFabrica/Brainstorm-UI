// @vitest-environment jsdom
/**
 * Which lens a search runs through. "My WoT" needs two API answers — a
 * personalized graph, and permission to search as yourself — and a reload asks
 * both again. Until they answer, the Account's last-known answer stands in:
 * otherwise every reload searched through the house first and then again
 * through My WoT, a wasted REQ and a flash of the wrong ranking.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const ME = "e".repeat(64);
const account = vi.hoisted(() => ({}) as { metadata?: Record<string, unknown> });
const mywot = { hasMywot: false, taPubkey: null, known: false };
const observer = { isSearchObserver: false, isLoading: true, known: false };

vi.mock("@/accounts", () => ({ accountManager: { active: account } }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["mywot", vi.fn()] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => mywot }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => observer }));

import { useSearchPov } from "./useSearchPov";

function answer(hasMywot: boolean, isSearchObserver: boolean) {
  Object.assign(mywot, { hasMywot, known: true });
  Object.assign(observer, { isSearchObserver, isLoading: false, known: true });
}

beforeEach(() => {
  account.metadata = { remembered: true };
  Object.assign(mywot, { hasMywot: false, known: false });
  Object.assign(observer, { isSearchObserver: false, isLoading: true, known: false });
});

describe("useSearchPov", () => {
  it("searches through My WoT at once when the Account last could — no house search first", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    const { result } = renderHook(() => useSearchPov());
    expect(result.current.effectivePov).toBe("mywot");
  });

  it("with nothing remembered, waits on the API through the house — and remembers its answer", () => {
    const { result, rerender } = renderHook(() => useSearchPov());
    expect(result.current.effectivePov).toBe("nosfabrica");

    answer(true, true);
    rerender();
    expect(result.current.effectivePov).toBe("mywot");
    expect(account.metadata?.canSearchMywot).toBe(true);
  });

  it("one answer is not both: a remembered yes holds until the other one lands", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    Object.assign(mywot, { hasMywot: true, known: true });
    const { result } = renderHook(() => useSearchPov());
    expect(result.current.effectivePov).toBe("mywot");
    expect(account.metadata?.canSearchMywot).toBe(true);
  });

  it("an answer that says no overrides the remembered yes, and is remembered", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    const { result, rerender } = renderHook(() => useSearchPov());
    expect(result.current.effectivePov).toBe("mywot");

    answer(true, false);
    rerender();
    expect(result.current.effectivePov).toBe("nosfabrica");
    expect(account.metadata?.canSearchMywot).toBe(false);
  });
});
