// @vitest-environment jsdom
/**
 * Whether the Account reads through its own web of trust. That needs two API
 * answers — a personalized graph, and permission to search as yourself — and a
 * reload asks both again. While they load, the Account's last-known answer
 * stands in: otherwise every reload searched through the house first and then
 * again through My WoT, a wasted REQ and a flash of the wrong ranking.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const ME = "e".repeat(64);
const account = vi.hoisted(() => ({}) as { metadata?: Record<string, unknown> });
const mywot = { hasMywot: false, taPubkey: null, known: false, isLoading: true };
const observer = { isSearchObserver: false, isLoading: true, known: false };

vi.mock("@/accounts", () => ({ accountManager: { active: account } }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ pubkey: ME }) }));
vi.mock("@/hooks/useActivePerspective", () => ({ useActivePerspective: () => ["mywot", vi.fn()] }));
vi.mock("@/hooks/useHasMywot", () => ({ useHasMywot: () => mywot }));
vi.mock("@/hooks/useIsSearchObserver", () => ({ useIsSearchObserver: () => observer }));

import { useCanSearchMywot } from "./useCanSearchMywot";
import { useSearchPov } from "./useSearchPov";

function answer(hasMywot: boolean, isSearchObserver: boolean) {
  Object.assign(mywot, { hasMywot, known: true, isLoading: false });
  Object.assign(observer, { isSearchObserver, known: true, isLoading: false });
}

beforeEach(() => {
  account.metadata = { remembered: true };
  Object.assign(mywot, { hasMywot: false, known: false, isLoading: true });
  Object.assign(observer, { isSearchObserver: false, known: false, isLoading: true });
});

describe("useCanSearchMywot", () => {
  it("answers yes at once while loading when the Account last could — no house search first", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    expect(renderHook(() => useCanSearchMywot()).result.current.canUseMywot).toBe(true);
    expect(renderHook(() => useSearchPov()).result.current.effectivePov).toBe("mywot");
  });

  it("with nothing remembered, says no until the API answers — and remembers its answer", () => {
    const { result, rerender } = renderHook(() => useCanSearchMywot());
    expect(result.current.canUseMywot).toBe(false);

    answer(true, true);
    rerender();
    expect(result.current.canUseMywot).toBe(true);
    expect(account.metadata?.canSearchMywot).toBe(true);
  });

  it("one answer is not both: a remembered yes holds until the other one lands", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    Object.assign(mywot, { hasMywot: true, known: true, isLoading: false });
    expect(renderHook(() => useCanSearchMywot()).result.current.canUseMywot).toBe(true);
    expect(account.metadata?.canSearchMywot).toBe(true);
  });

  it("an answer that says no overrides the remembered yes, and is remembered", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    const { result, rerender } = renderHook(() => useCanSearchMywot());
    expect(result.current.canUseMywot).toBe(true);

    answer(true, false);
    rerender();
    expect(result.current.canUseMywot).toBe(false);
    expect(account.metadata?.canSearchMywot).toBe(false);
  });

  // The stand-in is for a reload's wait, not a grant: with nothing being asked
  // (no Session) or an ask that failed, the answer is no, as it always was.
  it("a remembered yes does not stand in when nothing is being asked, or the ask failed", () => {
    account.metadata = { remembered: true, canSearchMywot: true };
    Object.assign(mywot, { isLoading: false });
    Object.assign(observer, { isLoading: false });
    expect(renderHook(() => useCanSearchMywot()).result.current.canUseMywot).toBe(false);
    // …and nothing it didn't hear is written over what it remembered.
    expect(account.metadata?.canSearchMywot).toBe(true);
  });
});
