import { beforeEach, describe, expect, it, vi } from "vitest";

/** Fresh module per test — depth is tracked in module state. */
async function load() {
  vi.resetModules();
  return import("./historyState");
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("history depth", () => {
  it("stamps the first entry of a load as depth 0", async () => {
    const { trackHistoryEntry, historyDepth } = await load();
    trackHistoryEntry();
    expect(historyDepth()).toBe(0);
  });

  it("counts each new entry as one deeper", async () => {
    const { trackHistoryEntry, historyDepth } = await load();
    trackHistoryEntry();
    window.history.pushState({}, "", "/a");
    trackHistoryEntry();
    expect(historyDepth()).toBe(1);
    window.history.pushState({}, "", "/b");
    trackHistoryEntry();
    expect(historyDepth()).toBe(2);
  });

  it("leaves an already-stamped entry alone, so returning to it reads the same depth", async () => {
    const { trackHistoryEntry, historyDepth } = await load();
    trackHistoryEntry();
    window.history.pushState({}, "", "/a");
    trackHistoryEntry();
    // What a pop back to this entry looks like: the stamp is still on it.
    trackHistoryEntry();
    expect(historyDepth()).toBe(1);
  });

  it("reads a cold deep link as depth 0 even when the tab has other history", async () => {
    const { historyDepth } = await load();
    window.history.pushState({}, "", "/t/bitcoin");
    expect(window.history.length).toBeGreaterThan(1);
    expect(historyDepth()).toBe(0);
  });
});

describe("hop marker", () => {
  it("is false until the entry is marked", async () => {
    const { hasHopped, markHopped } = await load();
    expect(hasHopped()).toBe(false);
    markHopped();
    expect(hasHopped()).toBe(true);
  });

  it("belongs to the entry, not the session", async () => {
    const { markHopped, hasHopped } = await load();
    markHopped();
    window.history.pushState({}, "", "/p/npub1");
    expect(hasHopped()).toBe(false);
  });

  it("survives depth stamping and vice versa", async () => {
    const { markHopped, hasHopped, trackHistoryEntry, historyDepth } = await load();
    trackHistoryEntry();
    markHopped();
    expect(hasHopped()).toBe(true);
    expect(historyDepth()).toBe(0);
  });
});
