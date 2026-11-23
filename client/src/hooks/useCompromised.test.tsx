// @vitest-environment jsdom
/**
 * A mark re-renders when its own account's reading changes, not on every
 * batch: a results page holds several per card, and each batch answers
 * someone else's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { __resetCompromised, lookupCompromised } from "@/services/compromised";
import { useCompromised, useReplaces } from "./useCompromised";

// The real lookup: test/setup.ts answers "nobody" for every other suite.
vi.unmock("@/services/compromised");

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const NEW_KEY = "d".repeat(64);

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const answer = (results: unknown[]) => new Response(JSON.stringify({ data: { results } }), { status: 200 });

beforeEach(() => {
  vi.useFakeTimers();
  __resetCompromised();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useCompromised", () => {
  it("re-renders for its own account's answer, and not for a batch about others", async () => {
    fetchMock.mockResolvedValueOnce(answer([{ pubkey: A, compromised: true, successor_pubkey: NEW_KEY }]));
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return useCompromised(A);
    });
    await act(() => vi.runAllTimersAsync());
    expect(result.current?.pubkey).toBe(A);
    const settled = renders;

    fetchMock.mockResolvedValueOnce(
      answer([
        { pubkey: B, compromised: true },
        { pubkey: C, compromised: false },
      ]),
    );
    void lookupCompromised(B);
    void lookupCompromised(C);
    await act(() => vi.runAllTimersAsync());
    expect(renders).toBe(settled);
    expect(result.current?.pubkey).toBe(A);
  });

  it("an owner's new account learns what it replaces from another account's record", async () => {
    fetchMock.mockResolvedValueOnce(answer([{ pubkey: NEW_KEY, compromised: false }]));
    const { result } = renderHook(() => useReplaces(NEW_KEY));
    await act(() => vi.runAllTimersAsync());
    expect(result.current).toBeNull();

    fetchMock.mockResolvedValueOnce(answer([{ pubkey: A, compromised: true, successor_pubkey: NEW_KEY }]));
    void lookupCompromised(A);
    await act(() => vi.runAllTimersAsync());
    expect(result.current?.pubkey).toBe(A);
  });
});
