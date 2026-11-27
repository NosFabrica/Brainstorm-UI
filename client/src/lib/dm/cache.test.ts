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

describe("reading an inbox by page", () => {
  it("hands rows over newest first, from where the last page ended, and oldest first when asked", async () => {
    const db = indexedDbBackend()!;
    const rows = [5, 1, 3, 3, 4, 2].map((at, i) => ({
      key: wrapKey("pager", `w${i}`),
      owner: "pager",
      wrapId: `w${i}`,
      at,
    }));
    await db.putWraps([...rows, { key: wrapKey("someone", "x"), owner: "someone", wrapId: "x", at: 9 }]);

    const first = await db.wrapsPage!("pager", { limit: 3 });
    expect(first.map((r) => r.at)).toEqual([5, 4, 3]);
    const last = first.at(-1)!;
    const second = await db.wrapsPage!("pager", { before: { at: last.at, key: last.key }, limit: 10 });
    expect(second.map((r) => r.at)).toEqual([3, 2, 1]);
    expect(new Set([...first, ...second].map((r) => r.wrapId)).size).toBe(6);
    expect((await db.wrapsPage!("pager", { limit: 2, oldestFirst: true })).map((r) => r.at)).toEqual([1, 2]);
    await db.forget!("pager");
    await db.forget!("someone");
  });

  it("adds its index to a database the previous version made", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    globalThis.indexedDB = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("brainstorm-dm", 1);
      req.onupgradeneeded = () => {
        const wraps = req.result.createObjectStore("wraps", { keyPath: "key" });
        wraps.createIndex("owner", "owner");
        req.result.createObjectStore("state", { keyPath: "owner" });
      };
      req.onsuccess = () => {
        const tx = req.result.transaction("wraps", "readwrite");
        tx.objectStore("wraps").put({ key: wrapKey("old", "w"), owner: "old", wrapId: "w", at: 7 });
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
      };
      req.onerror = () => reject(req.error);
    });

    const db = indexedDbBackend()!;
    expect((await db.wrapsPage!("old", { limit: 5 })).map((r) => r.wrapId)).toEqual(["w"]);
  });
});
