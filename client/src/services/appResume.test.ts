import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wakeRelays = vi.fn();
const checkForUpdate = vi.fn();
const invalidateQueries = vi.fn(() => Promise.resolve());
let back: (awayMs: number, how: "visible" | "pageshow" | "online") => void = () => {};
let clock = 0;

const reopenWindows = vi.fn();
vi.mock("@/lib/relayPool", () => ({ wakeRelays }));
vi.mock("@/lib/askOnce", () => ({ reopenWindows }));
vi.mock("@/lib/serviceWorker", () => ({ checkForUpdate }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { invalidateQueries } }));
vi.mock("@/lib/appResume", () => ({
  onAppResume: (listener: typeof back) => {
    back = listener;
    return () => {};
  },
}));

const { REFRESH_AFTER_MS, UPDATE_CHECK_EVERY_MS, WAKE_AFTER_MS, startAppResume } = await import("./appResume");

beforeEach(() => {
  clock = 1_000_000;
  startAppResume(() => clock);
});
afterEach(() => vi.clearAllMocks());

describe("coming back to the app", () => {
  it("after a real absence, reconnects and looks for a deploy", () => {
    back(WAKE_AFTER_MS, "visible");
    expect(wakeRelays).toHaveBeenCalledTimes(1);
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("leaves the relays alone for a glance at another tab, but not when the connection is back", () => {
    back(800, "visible");
    expect(wakeRelays).not.toHaveBeenCalled();
    back(800, "online");
    expect(wakeRelays).toHaveBeenCalledTimes(1);
  });

  it("looks for a deploy at most every few minutes", () => {
    back(60_000, "visible");
    clock += 60_000;
    back(60_000, "visible");
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    clock += UPDATE_CHECK_EVERY_MS;
    back(60_000, "visible");
    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("asks the API again only after a long absence", () => {
    back(REFRESH_AFTER_MS, "visible");
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });

  // The relay reads live in the store, asked once per key per window
  // (lib/askOnce); invalidating react-query never reached them.
  it("re-opens the relay asks after a long absence, and only then", () => {
    back(REFRESH_AFTER_MS - 1, "visible");
    expect(reopenWindows).not.toHaveBeenCalled();
    back(REFRESH_AFTER_MS, "visible");
    expect(reopenWindows).toHaveBeenCalledTimes(1);
  });

  it("leaves the tag reads to their own staleTime — the API's answers are refetched", () => {
    back(REFRESH_AFTER_MS, "visible");
    const [{ predicate }] = invalidateQueries.mock.calls[0] as unknown as [
      { predicate: (q: { queryKey: unknown[] }) => boolean },
    ];
    expect(predicate({ queryKey: ["/user/self"] })).toBe(true);
    expect(predicate({ queryKey: ["share-overview", "a"] })).toBe(true);
    expect(predicate({ queryKey: ["tag-index", "anon", "house"] })).toBe(false);
    expect(predicate({ queryKey: ["profile-tags", "a", "anon", "house"] })).toBe(false);
  });
});

describe("the tag reads it leaves alone", () => {
  /** A tag query added to useTags without joining the list would be re-asked on every return. */
  it("are every query key root hooks/useTags makes", async () => {
    const { TAG_QUERY_ROOTS } = await import("./appResume");
    const source = readFileSync(resolve(__dirname, "../hooks/useTags.ts"), "utf8");
    const roots = [...source.matchAll(/(?:Key\s*=\s*(?:\([^)]*\)\s*=>\s*)?|queryKey:\s*)\[\s*"([a-z][a-z-]*)"/g)].map(
      (m) => m[1],
    );
    expect(roots.length).toBeGreaterThan(5);
    for (const root of roots) expect(TAG_QUERY_ROOTS).toContain(root);
  });
});
