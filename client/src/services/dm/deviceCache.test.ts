// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { CHAT_KIND, GIFT_WRAP_KIND, makeRumor } from "@/lib/dm/giftWrap";
import { FAILED_RULES, wrapKey, type CachedOpen, type StoredWrap } from "@/lib/dm/cache";
import type { CursorSnapshot } from "@/lib/dm/cursors";
import { DeviceCache, type DeviceCacheHost } from "./deviceCache";
import { coreFor, memoryCache, NOW, plainSealer, settle } from "./test-fakes";

const ME = "a".repeat(64);
const ANA = "b".repeat(64);

function host(over: Partial<DeviceCacheHost> = {}) {
  const sync: { lastSeen?: number; cursors?: CursorSnapshot } = {};
  const ingested: { wrap: NostrEvent; relay: string }[] = [];
  const h: DeviceCacheHost = {
    ingest: (wrap, relay) => void ingested.push({ wrap, relay }),
    restoreSync: (lastSeen, cursors) => Object.assign(sync, { lastSeen, cursors }),
    syncState: () => sync,
    restoreOutbox: async () => {},
    sealOutbox: async () => undefined,
    ...over,
  };
  return { h, sync, ingested };
}

function keptRow(wrapId: string, at: number, content: string): StoredWrap {
  const rumor = makeRumor({ pubkey: ANA, kind: CHAT_KIND, tags: [["p", ME]], content, created_at: at });
  const open: CachedOpen = { rumor, wrapId, wrapAt: at, relays: ["wss://in.example/"] };
  return { key: wrapKey(ME, wrapId), owner: ME, wrapId, at, envelope: `sealed:${JSON.stringify(open)}` };
}

const wrapEvent = (id: string): NostrEvent => ({
  id,
  kind: GIFT_WRAP_KIND,
  pubkey: "c".repeat(64),
  created_at: NOW,
  tags: [["p", ME]],
  content: "",
  sig: "",
});

describe("DeviceCache", () => {
  it("restores the paging state and which wraps are held, from the keys alone", async () => {
    const cache = memoryCache();
    cache.rows.set(wrapKey(ME, "w1"), keptRow("w1", NOW - 10, "hi"));
    cache.st.set(ME, { owner: ME, lastSeen: NOW - 100, syncVersion: 2, cursors: { floor: 1, relays: {} } });
    const wraps = vi.spyOn(cache, "wraps");
    const { core } = coreFor(ME);
    const { h, sync } = host();
    const device = new DeviceCache(core, cache, plainSealer, h);

    await device.restore();

    expect(sync.lastSeen).toBe(NOW - 100);
    expect(sync.cursors).toEqual({ floor: 1, relays: {} });
    expect(core.seen.has("w1")).toBe(true);
    expect(wraps).not.toHaveBeenCalled();
    // Nothing opened yet: that is hydrateRows' work.
    expect(core.wrapToMessage.size).toBe(0);
  });

  it("drops paging state made by an older version", async () => {
    const cache = memoryCache();
    cache.st.set(ME, { owner: ME, lastSeen: NOW - 100, syncVersion: 1 });
    const { core } = coreFor(ME);
    const { h, sync } = host();
    await new DeviceCache(core, cache, plainSealer, h).restore();
    expect(sync).toEqual({ lastSeen: undefined, cursors: undefined });
  });

  it("opens kept rows into the store, and merges a copy that arrived from a relay meanwhile", async () => {
    const cache = memoryCache();
    const row = keptRow("w1", NOW - 10, "kept");
    cache.rows.set(row.key, row);
    const { core } = coreFor(ME);
    const device = new DeviceCache(core, cache, plainSealer, host().h);
    await device.restore();

    expect(device.holdEarly(wrapEvent("w1"), "wss://other.example/")).toBe(true);
    expect(device.holdEarly(wrapEvent("not-held"), "wss://other.example/")).toBe(false);
    await device.hydrateRows();

    const id = core.wrapToMessage.get("w1")!;
    expect(core.store.message(id)?.rumor.content).toBe("kept");
    expect(core.store.message(id)?.relays.sort()).toEqual(["wss://in.example/", "wss://other.example/"]);
    // Read back: a later copy is no longer held for it.
    expect(device.holdEarly(wrapEvent("w1"), "wss://third.example/")).toBe(false);
  });

  it("releases a row it can't open, and opens the copy that arrived meanwhile afresh", async () => {
    const cache = memoryCache();
    cache.rows.set(wrapKey(ME, "w1"), { ...keptRow("w1", NOW - 10, "x"), envelope: "garbage" });
    const { core } = coreFor(ME);
    const { h, ingested } = host();
    const device = new DeviceCache(core, cache, plainSealer, h);
    await device.restore();
    device.holdEarly(wrapEvent("w1"), "wss://in.example/");
    await device.hydrateRows();

    expect(core.seen.has("w1")).toBe(false);
    expect(ingested.map((i) => [i.wrap.id, i.relay])).toEqual([["w1", "wss://in.example/"]]);
  });

  it("batches writes behind one timer and remembers a failure by its reason and rules", async () => {
    const cache = memoryCache();
    const { core, timers } = coreFor(ME);
    const device = new DeviceCache(core, cache, plainSealer, host().h);

    device.keepFailed("w1", NOW, "broken");
    device.keepFailed("w2", NOW, "skipped");
    expect(timers.pending.size).toBe(1);
    expect(cache.rows.size).toBe(0);
    timers.flush();
    await settle();

    expect(cache.rows.get(wrapKey(ME, "w1"))).toEqual({
      key: wrapKey(ME, "w1"),
      owner: ME,
      wrapId: "w1",
      at: NOW,
      failed: true,
      reason: "broken",
      rules: FAILED_RULES,
    });
    expect(cache.rows.get(wrapKey(ME, "w2"))?.reason).toBe("skipped");
  });

  it("writes nothing after the cache is cleared (sign-out), not even stop's flush", async () => {
    const cache = memoryCache();
    const { core } = coreFor(ME);
    const { h, sync } = host();
    const device = new DeviceCache(core, cache, plainSealer, h);
    device.keepFailed("w1", NOW, "broken");
    await cache.clear();

    sync.lastSeen = NOW;
    core.stopped = true;
    device.stop();
    await settle();

    expect(cache.rows.size).toBe(0);
    expect(cache.st.size).toBe(0);
  });

  it("takes the guard once, when built: a clear before then doesn't stop its writes", async () => {
    const cache = memoryCache();
    await cache.clear();
    const { core } = coreFor(ME);
    const device = new DeviceCache(core, cache, plainSealer, host().h);
    device.keepFailed("w1", NOW, "broken");
    device.flushWrites();
    await settle();
    expect(cache.rows.size).toBe(1);
  });

  it("once stopped, saves state only through stop's own final write", async () => {
    const cache = memoryCache();
    const { core, timers } = coreFor(ME);
    const { h, sync } = host({ sealOutbox: async () => "sealed-outbox" });
    const device = new DeviceCache(core, cache, plainSealer, h);
    sync.lastSeen = NOW - 5;

    device.scheduleState();
    expect(timers.pending.size).toBe(1);
    core.stopped = true;
    device.persistState();
    device.scheduleState();
    await settle();
    expect(cache.st.size).toBe(0);

    device.stop();
    // The pending state timer is gone; the final write went.
    expect(timers.pending.size).toBe(0);
    await settle();
    expect(cache.st.get(ME)).toEqual({ owner: ME, lastSeen: NOW - 5, syncVersion: 2, outbox: "sealed-outbox" });
  });

  it("keeps nothing once stopped", async () => {
    const cache = memoryCache();
    const { core, timers } = coreFor(ME);
    const device = new DeviceCache(core, cache, plainSealer, host().h);
    core.stopped = true;
    device.keepFailed("w1", NOW, "broken");
    expect(timers.pending.size).toBe(0);
    device.flushWrites();
    await settle();
    expect(cache.rows.size).toBe(0);
  });

  it("forgets the rows of messages that expired", async () => {
    const cache = memoryCache();
    const row = keptRow("w1", NOW - 10, "gone soon");
    cache.rows.set(row.key, row);
    const { core } = coreFor(ME);
    const device = new DeviceCache(core, cache, plainSealer, host().h);
    device.forget([{ wrapId: "w1" } as never]);
    await settle();
    expect(cache.rows.size).toBe(0);
  });

  it("does nothing without a cache", async () => {
    const { core, timers } = coreFor(ME);
    const device = new DeviceCache(core, null, plainSealer, host().h);
    await device.restore();
    await device.hydrateRows();
    device.keepFailed("w1", NOW, "broken");
    device.scheduleState();
    device.stop();
    expect(timers.pending.size).toBe(0);
  });
});
