import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { indexedDbBackend, wrapKey } from "./cache";

describe("DM cache (IndexedDB)", () => {
  it("keeps wraps and paging state per account", async () => {
    const db = indexedDbBackend()!;
    await db.putWraps([
      { key: wrapKey("me", "w1"), owner: "me", wrapId: "w1", at: 10, envelope: "v1:x:y" },
      { key: wrapKey("other", "w2"), owner: "other", wrapId: "w2", at: 11, failed: true },
    ]);
    await db.putState({ owner: "me", lastSeen: 99, cursors: { floor: 50, relays: { "wss://r/": { reached: 40 } } } });
    expect((await db.wraps("me")).map((r) => r.wrapId)).toEqual(["w1"]);
    // Which wraps are held, without reading a single row.
    expect(await db.wrapKeys!("me")).toEqual([wrapKey("me", "w1")]);
    expect(await db.state("me")).toMatchObject({ lastSeen: 99 });
    await db.deleteWraps([wrapKey("me", "w1")]);
    expect(await db.wraps("me")).toEqual([]);
    await db.clear();
    expect(await db.wraps("other")).toEqual([]);
    expect(await db.state("me")).toBeUndefined();
  });

  it("drops a write that was asked for before a sign-out cleared the cache", async () => {
    const db = indexedDbBackend()!;
    const late = db.putState({ owner: "me", lastSeen: 1 });
    await db.clear();
    await late;
    expect(await db.state("me")).toBeUndefined();
  });
});

describe("DM cache across tabs", () => {
  // Each backend is one tab's. Tab B's engine flushes as it stops; that write could
  // reach the database after tab A's sign-out cleared it, and B's own epoch had
  // never moved, so it went in.
  it("drops a write from a tab that hasn't seen another tab's clear", async () => {
    const a = indexedDbBackend()!;
    const b = indexedDbBackend()!;
    await b.putState({ owner: "me", lastSeen: 1 });
    const bGuard = b.guard!();
    await a.clear();
    // As B's engine flushes on stop: both at once.
    await Promise.all([
      b.putState({ owner: "me", lastSeen: 2, outbox: "sealed rumor" }),
      b.putWraps([{ key: wrapKey("me", "w9"), owner: "me", wrapId: "w9", at: 9, envelope: "v1:x:y" }]),
    ]);
    expect(await a.state("me")).toBeUndefined();
    expect(await a.wraps("me")).toEqual([]);
    // …and B's engines learn it: every guard taken before the clear has ended.
    expect(bGuard()).toBe(false);
    // What B writes from now on is for whoever signs in next, and is kept.
    await b.putState({ owner: "next", lastSeen: 3 });
    expect(await a.state("next")).toMatchObject({ lastSeen: 3 });
  });
});

describe("forgetting one account", () => {
  it("drops its wraps and state, and nobody else's", async () => {
    const db = indexedDbBackend()!;
    await db.putWraps([
      { key: wrapKey("gone", "w1"), owner: "gone", wrapId: "w1", at: 10, envelope: "v1:x:y" },
      { key: wrapKey("kept", "w2"), owner: "kept", wrapId: "w2", at: 11, envelope: "v1:x:y" },
    ]);
    await db.putState({ owner: "gone", lastSeen: 1 });
    await db.putState({ owner: "kept", lastSeen: 2 });
    await db.forget!("gone");
    expect(await db.wraps("gone")).toEqual([]);
    expect(await db.state("gone")).toBeUndefined();
    expect((await db.wraps("kept")).map((r) => r.wrapId)).toEqual(["w2"]);
    expect(await db.state("kept")).toMatchObject({ lastSeen: 2 });
  });
});
