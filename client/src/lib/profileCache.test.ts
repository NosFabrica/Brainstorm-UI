// @vitest-environment jsdom
/**
 * Names and avatars kept on the device, so a reload doesn't ask the relay for
 * people it already knows. Driven against a real IndexedDB (fake-indexeddb):
 * the transactions, the index cursor and the eviction are the risky half.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { NostrEvent } from "nostr-tools";
import {
  readProfiles,
  readProfileRows,
  writeProfiles,
  startProfileCacheSync,
  __useProfileStore,
  MAX_PROFILES,
  PROFILE_FRESH_MS,
  PROFILE_TTL_MS,
} from "./profileCache";
import { eventStore } from "./eventStore";

const profile = (pubkey: string, created_at = 1): NostrEvent =>
  ({ id: `id-${pubkey}`, kind: 0, pubkey, tags: [], content: JSON.stringify({ name: pubkey }), created_at, sig: "s" }) as NostrEvent;

beforeEach(() => {
  // A fresh device each time.
  indexedDB = new IDBFactory();
  __useProfileStore(undefined);
});

describe("the profile cache", () => {
  it("gives back what it was given", async () => {
    await writeProfiles([profile("a"), profile("b")]);
    const held = await readProfiles(["a", "b", "c"]);
    expect([...held.keys()].sort()).toEqual(["a", "b"]);
    expect(held.get("a")?.content).toContain("a");
  });

  it("keeps the newer of two copies, whichever order they arrive in", async () => {
    await writeProfiles([profile("a", 200)]);
    await writeProfiles([profile("a", 100)]);
    expect((await readProfiles(["a"])).get("a")?.created_at).toBe(200);
  });

  it("stops answering alone once a copy is old enough to have changed", async () => {
    await writeProfiles([profile("a")]);
    vi.setSystemTime(Date.now() + PROFILE_FRESH_MS + 1);
    // Still held, so it can be shown…
    expect((await readProfileRows(["a"])).has("a")).toBe(true);
    // …but no longer an answer on its own, or a changed name would stick.
    expect(await readProfiles(["a"])).toEqual(new Map());
    vi.useRealTimers();
  });

  it("forgets a profile that has sat far too long", async () => {
    await writeProfiles([profile("a")]);
    vi.setSystemTime(Date.now() + PROFILE_TTL_MS + 1);
    expect(await readProfileRows(["a"])).toEqual(new Map());
    vi.useRealTimers();
  });

  it("stays bounded — the least recently learned go first", async () => {
    await writeProfiles(Array.from({ length: MAX_PROFILES }, (_, i) => profile(`p${i}`)));
    vi.setSystemTime(Date.now() + 1000);
    await writeProfiles([profile("newcomer")]);
    vi.useRealTimers();
    const held = await readProfileRows(["p0", "newcomer"]);
    expect(held.has("newcomer")).toBe(true);
    expect(held.has("p0")).toBe(false);
  });

  it("keeps out anything that is not a profile", async () => {
    await writeProfiles([{ ...profile("a"), kind: 30078 } as NostrEvent]);
    expect(await readProfileRows(["a"])).toEqual(new Map());
  });

  it("is quiet on a device with no storage at all", async () => {
    __useProfileStore(null);
    await expect(writeProfiles([profile("a")])).resolves.toBeUndefined();
    await expect(readProfiles(["a"])).resolves.toEqual(new Map());
  });
});

describe("keeping up with what the app learns", () => {
  it("writes through whatever reaches the store — the User's own edit included", async () => {
    const stop = startProfileCacheSync();
    // The store verifies signatures, so push the insert directly.
    eventStore.insert$.next(profile("mine", 500));
    await vi.waitFor(async () => expect((await readProfiles(["mine"])).size).toBe(1), { timeout: 3000 });
    stop();
  });
});
