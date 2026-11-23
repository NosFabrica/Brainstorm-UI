// @vitest-environment jsdom
/**
 * One ask per key per window (lib/askOnce) — bounded, so a tab open for days
 * doesn't keep every key it ever asked about, and keyed so a caller outside
 * React can make the very ask a store hook makes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  MAX_KEYS,
  REPLACEABLE_ASK_WINDOW,
  __askSizes,
  __resetAsks,
  askOnce,
  forgetSettled,
  isDue,
  lastAnswer,
  replaceableAskKey,
} from "./askOnce";
import { useStoreReplaceable } from "@/hooks/useStoreReplaceable";

beforeEach(() => __resetAsks());

describe("bounded", () => {
  it("forgets the keys asked longest ago, past the cap", async () => {
    for (let i = 0; i < MAX_KEYS + 50; i++) await askOnce(`k${i}`, { minMs: 60_000 }, async () => i);
    expect(__askSizes().windows).toBeLessThanOrEqual(MAX_KEYS);
    expect(__askSizes().answers).toBeLessThanOrEqual(MAX_KEYS);
    // The oldest go first: asked again, the newest are still inside their window.
    expect(isDue("k0")).toBe(true);
    expect(isDue(`k${MAX_KEYS + 49}`)).toBe(false);
    expect(lastAnswer(`k${MAX_KEYS + 49}`)).toBe(MAX_KEYS + 49);
  });

  it("never forgets an ask that is still out", async () => {
    let finish!: () => void;
    const out = askOnce("slow", { minMs: 60_000 }, () => new Promise<void>((resolve) => (finish = resolve)));
    for (let i = 0; i < MAX_KEYS + 10; i++) await askOnce(`k${i}`, { minMs: 60_000 }, async () => i);
    expect(isDue("slow")).toBe(false);
    finish();
    await out;
  });

  it("forgets every settled window when the store dropped events, so the next mount asks again", async () => {
    await askOnce("note", { minMs: 60_000 }, async () => "answer");
    expect(isDue("note")).toBe(false);
    forgetSettled();
    expect(isDue("note")).toBe(true);
    expect(lastAnswer("note")).toBeUndefined();
  });
});

describe("the key a store hook asks a replaceable under", () => {
  /** lib/eventCache's boot revalidation makes this ask; the hook must join it, not repeat it. */
  it("is the one useStoreReplaceable uses", async () => {
    const pubkey = "a".repeat(64);
    const first = vi.fn(async () => null);
    askOnce(replaceableAskKey(3, pubkey), REPLACEABLE_ASK_WINDOW, first);
    const hookAsk = vi.fn(async () => null);
    renderHook(() => useStoreReplaceable(3, pubkey, hookAsk));
    expect(first).toHaveBeenCalledTimes(1);
    expect(hookAsk).not.toHaveBeenCalled();
  });
});
