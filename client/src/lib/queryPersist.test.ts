/**
 * The reader's own slow reads, kept on the device between visits: theirs only,
 * this build's only, a day at most, and gone the moment the cache forgets the
 * Account.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { BehaviorSubject } from "rxjs";
import {
  BUILD_BUSTER,
  MAX_AGE_MS,
  __setPersistStore,
  dropPersistedQueries,
  isPersistedKey,
  restoreQueries,
  saveQueries,
  startQueryPersistence,
  type PersistStore,
  type PersistedRow,
} from "./queryPersist";

const ME = "a".repeat(64);
const THEM = "b".repeat(64);

function memoryStore(): PersistStore & { row: PersistedRow | undefined } {
  const s = {
    row: undefined as PersistedRow | undefined,
    get: async () => s.row,
    put: async (row: PersistedRow) => {
      s.row = structuredClone(row);
    },
    clear: async () => {
      s.row = undefined;
    },
  };
  return s;
}

let store: ReturnType<typeof memoryStore>;
beforeEach(() => {
  store = memoryStore();
  __setPersistStore(store);
});
afterEach(() => {
  __setPersistStore(undefined);
  vi.useRealTimers();
});

describe("isPersistedKey", () => {
  it("keeps the reader's own slow reads", () => {
    for (const key of [
      ["/user/overview", ME, "viewer"],
      ["/user/stats", ME, "house"],
      ["/user/history", ME],
      ["/networkAlerts", ME, 100],
      ["/user/graperank/preset", ME],
      ["/user/graperankResult"],
      ["billing-plans"],
    ])
      expect(isPersistedKey(key, ME)).toBe(true);
  });

  it("never anyone else's, nor anything off the list", () => {
    for (const key of [
      ["/user/overview", THEM, "viewer"],
      ["/user/stats", THEM, "house"],
      ["/user/top-followers", ME, "house"],
      ["/user/subscription"],
      ["/user/connections", ME, "followed_by"],
      ["nostr-profile", ME],
    ])
      expect(isPersistedKey(key, ME)).toBe(false);
  });
});

describe("save and restore", () => {
  function seeded(): QueryClient {
    const qc = new QueryClient();
    qc.setQueryData(["/user/overview", ME, "viewer"], { data: { influence: 1 } });
    qc.setQueryData(["/user/graperankResult"], { data: { status: "success" } });
    qc.setQueryData(["/user/overview", THEM, "viewer"], { data: { influence: 0.3 } });
    return qc;
  }

  it("keeps only the reader's own, and puts them back stale so the first screen refreshes them", async () => {
    await saveQueries(seeded(), ME);
    expect(store.row?.pubkey).toBe(ME);
    expect(store.row?.buster).toBe(BUILD_BUSTER);
    expect(store.row?.state.queries.map((q) => q.queryKey)).toEqual([
      ["/user/overview", ME, "viewer"],
      ["/user/graperankResult"],
    ]);

    const fresh = new QueryClient();
    expect(await restoreQueries(fresh, ME)).toBe(2);
    expect(fresh.getQueryData(["/user/overview", ME, "viewer"])).toEqual({ data: { influence: 1 } });
    expect(fresh.getQueryState(["/user/overview", ME, "viewer"])?.isInvalidated).toBe(true);
    expect(fresh.getQueryData(["/user/overview", THEM, "viewer"])).toBeUndefined();
  });

  it("restores nothing into another Account's session, and forgets the copy", async () => {
    await saveQueries(seeded(), ME);
    expect(await restoreQueries(new QueryClient(), THEM)).toBe(0);
    expect(store.row).toBeUndefined();
  });

  it("drops a copy from another build", async () => {
    await saveQueries(seeded(), ME);
    store.row = { ...store.row!, buster: "some-older-build" };
    expect(await restoreQueries(new QueryClient(), ME)).toBe(0);
    expect(store.row).toBeUndefined();
  });

  it("drops a copy older than a day", async () => {
    const now = Date.now();
    await saveQueries(seeded(), ME, now - MAX_AGE_MS - 1);
    expect(await restoreQueries(new QueryClient(), ME, now)).toBe(0);
  });

  it("a drop forgets the copy, and a restore already under way lands nothing", async () => {
    await saveQueries(seeded(), ME);
    const qc = new QueryClient();
    const restoring = restoreQueries(qc, ME);
    dropPersistedQueries();
    expect(await restoring).toBe(0);
    await Promise.resolve();
    expect(store.row).toBeUndefined();
  });
});

describe("startQueryPersistence", () => {
  it("restores for the active Account at once, and writes their answers as they land", async () => {
    vi.useFakeTimers();
    await saveQueries(
      (() => {
        const qc = new QueryClient();
        qc.setQueryData(["/user/history", ME], { data: { ta_pubkey: "t" } });
        return qc;
      })(),
      ME,
    );
    const qc = new QueryClient();
    const stop = startQueryPersistence(qc, { active: { pubkey: ME }, active$: new BehaviorSubject({ pubkey: ME }) });
    await vi.waitFor(() => expect(qc.getQueryData(["/user/history", ME])).toEqual({ data: { ta_pubkey: "t" } }));

    await qc.fetchQuery({ queryKey: ["/user/stats", ME, "viewer"], queryFn: async () => ({ data: { s: 1 } }) });
    await qc.fetchQuery({ queryKey: ["/user/stats", THEM, "viewer"], queryFn: async () => ({ data: { s: 2 } }) });
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.row?.state.queries.map((q) => q.queryKey)).toContainEqual(["/user/stats", ME, "viewer"]);
    expect(store.row?.state.queries.map((q) => q.queryKey)).not.toContainEqual(["/user/stats", THEM, "viewer"]);
    stop();
  });
});
