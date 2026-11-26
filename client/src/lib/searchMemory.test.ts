import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchHit } from "@/services/search";
import {
  __resetSearchMemory,
  recallComposed,
  recallSearch,
  rememberComposed,
  rememberKey,
  rememberSearch,
} from "./searchMemory";

const hit = (id: string): SearchHit => ({
  event: { id, pubkey: "a".repeat(64), created_at: 1, kind: 1, tags: [], content: "", sig: "" },
  author: null,
  rank: null,
});

beforeEach(() => {
  __resetSearchMemory();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("rememberKey", () => {
  it("keeps every part apart: a signed-in search is not the anonymous one", () => {
    expect(rememberKey("bitcoin", "notes", "mywot", "pk")).not.toBe(rememberKey("bitcoin", "notes", "mywot"));
    expect(rememberKey("a b", "notes", "x")).not.toBe(rememberKey("a", "b notes", "x"));
  });
});

describe("a search's memory", () => {
  it("recalls what it had and where the reader was", () => {
    rememberSearch("k", [hit("1")], 420);
    expect(recallSearch("k")).toMatchObject({ hits: [hit("1")], scrollY: 420 });
  });

  it("forgets a search after ten minutes", () => {
    rememberSearch("k", [hit("1")], 0);
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(recallSearch("k")).toBeNull();
  });

  it("holds eight searches, dropping the one used longest ago", () => {
    for (let i = 0; i < 8; i++) rememberSearch(`k${i}`, [hit(String(i))], 0);
    // Remembered again, k0 is the newest: the ninth pushes out k1.
    rememberSearch("k0", [hit("0")], 0);
    rememberSearch("k8", [hit("8")], 0);
    expect(recallSearch("k0")).not.toBeNull();
    expect(recallSearch("k1")).toBeNull();
    expect(recallSearch("k8")).not.toBeNull();
  });
});

describe("the composed page's memory", () => {
  it("remembers sections only when one of them has hits", () => {
    rememberComposed("c", { people: [], notes: [] }, 100);
    expect(recallComposed("c")).toBeNull();
    rememberComposed("c", { people: [hit("p")], notes: [] }, 100);
    expect(recallComposed("c")).toEqual({ sections: { people: [hit("p")], notes: [] }, scrollY: 100 });
  });

  it("forgets after ten minutes too", () => {
    rememberComposed("c", { people: [hit("p")] }, 0);
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(recallComposed("c")).toBeNull();
  });
});
