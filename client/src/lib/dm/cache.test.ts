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
