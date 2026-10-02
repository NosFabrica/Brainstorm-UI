// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishAlertPrefs = vi.fn();
const fetchAlertPrefs = vi.fn();
const activeAccount = vi.fn();

vi.mock("@/services/nostr", () => ({
  DM_PREFS_D_TAG: "brainstorm.world/dm-prefs",
  publishAlertPrefs: (...args: unknown[]) => publishAlertPrefs(...args),
  fetchAlertPrefs: (...args: unknown[]) => fetchAlertPrefs(...args),
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => activeAccount(),
}));

const PK = "a".repeat(64);
const ROOM = `${"b".repeat(64)},${PK}`;
const OTHER_ROOM = `${"c".repeat(64)},${PK}`;

let prefs: typeof import("./prefs");
let sync: typeof import("./prefsSync");

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  localStorage.clear();
  activeAccount.mockReturnValue({ pubkey: PK });
  publishAlertPrefs.mockResolvedValue({ success: true });
  fetchAlertPrefs.mockResolvedValue(null);
  prefs = await import("./prefs");
  sync = await import("./prefsSync");
});

afterEach(() => {
  vi.useRealTimers();
});

/** The blob the last publish carried (before `publishAlertPrefs` encrypts it). */
const published = () => publishAlertPrefs.mock.calls.at(-1)?.[0] as Record<string, unknown>;

describe("reconciling this device with the account's copy", () => {
  const local = (over: Partial<import("./prefs").DmPrefs> = {}) => ({ ...prefs.readDmPrefs(PK), ...over });

  it("takes the account's copy when it is newer, even over a change made here", () => {
    const plan = sync.reconcileDmPrefs(
      local({ pinned: [ROOM], sync: { at: 100, dirty: true } }),
      { updatedAt: 200, pinned: [OTHER_ROOM], muted: [], accepted: [] },
      999,
    );
    expect(plan).toEqual({
      kind: "adopt",
      fields: { pinned: [OTHER_ROOM], muted: [], accepted: [] },
      sync: { at: 200, dirty: false },
      publish: false,
    });
  });

  it("sends this device's copy up when it is newer", () => {
    const plan = sync.reconcileDmPrefs(
      local({ pinned: [ROOM], sync: { at: 300, dirty: true } }),
      { updatedAt: 200, pinned: [], muted: [], accepted: [] },
      999,
    );
    expect(plan).toEqual({ kind: "publish" });
  });

  it("merges both on a device's first sync, so pins made before sync existed survive", () => {
    const plan = sync.reconcileDmPrefs(
      local({ pinned: [ROOM] }),
      { updatedAt: 200, pinned: [OTHER_ROOM], muted: [], accepted: [] },
      999,
    );
    expect(plan).toMatchObject({
      kind: "adopt",
      fields: { pinned: [OTHER_ROOM, ROOM] },
      sync: { at: 999, dirty: true },
      publish: true,
    });
  });

  it("keeps this device's list for a field the account's copy doesn't carry", () => {
    const plan = sync.reconcileDmPrefs(
      local({ muted: [ROOM], sync: { at: 100, dirty: false } }),
      { updatedAt: 200, pinned: [OTHER_ROOM] },
      999,
    );
    expect(plan).toMatchObject({ kind: "adopt", fields: { pinned: [OTHER_ROOM] } });
    expect((plan as { fields: object }).fields).not.toHaveProperty("muted");
  });

  it("doesn't stamp a first copy when nothing came back, so a missed fetch still merges later", () => {
    expect(sync.reconcileDmPrefs(local({ pinned: [ROOM] }), null, 999)).toEqual({ kind: "publish" });
    expect(sync.reconcileDmPrefs(local(), null, 999)).toEqual({ kind: "keep" });
  });

  it("reads only well-formed content", () => {
    expect(sync.parseRemoteDmPrefs(null)).toBeNull();
    expect(sync.parseRemoteDmPrefs({ pinned: [ROOM] })).toBeNull();
    expect(sync.parseRemoteDmPrefs({ updated_at: 5, pinned: [ROOM, 7], muted: "x" })).toEqual({
      updatedAt: 5,
      pinned: [ROOM],
    });
  });
});

describe("pinning a chat", () => {
  it("publishes the synced fields once a burst of toggles settles", async () => {
    vi.useFakeTimers();
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    prefs.setRoomMuted(PK, ROOM, true);
    prefs.setRoomPinned(PK, OTHER_ROOM, true);
    expect(prefs.readDmPrefs(PK).sync?.dirty).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);

    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
    const [blob, dTag, opts] = publishAlertPrefs.mock.calls[0];
    expect(dTag).toBe("brainstorm.world/dm-prefs");
    expect(opts).toEqual({ background: true });
    expect(blob).toMatchObject({ v: 1, pinned: [OTHER_ROOM, ROOM], muted: [ROOM], accepted: [] });
    expect(prefs.readDmPrefs(PK).sync?.dirty).toBe(false);
    stop();
  });

  it("doesn't publish for changes that don't sync", async () => {
    vi.useFakeTimers();
    const stop = sync.startDmPrefsSync();
    prefs.markRoomRead(PK, ROOM, 50);
    prefs.setRoomTimer(PK, ROOM, 3600);
    await vi.advanceTimersByTimeAsync(2000);
    expect(publishAlertPrefs).not.toHaveBeenCalled();
    stop();
  });

  it("stays dirty for later when the account is locked, without retrying on a clock", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({ success: false, deferred: true });
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
    expect(prefs.readDmPrefs(PK).sync?.dirty).toBe(true);
    stop();
  });

  it("retries a relay failure a few times, then waits for the next sync", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({ success: false, error: "All relays failed" });
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(publishAlertPrefs).toHaveBeenCalledTimes(4);
    stop();
  });
});

describe("opening the inbox", () => {
  it("brings in pins made on another device", async () => {
    prefs.applySyncedDmPrefs(PK, { pinned: [ROOM] }, { at: 100, dirty: false });
    fetchAlertPrefs.mockResolvedValue({ v: 1, updated_at: 200, pinned: [OTHER_ROOM], muted: [], accepted: [ROOM] });

    await sync.hydrateDmPrefs(PK);

    const p = prefs.readDmPrefs(PK);
    expect(p.pinned).toEqual([OTHER_ROOM]);
    expect(p.accepted).toEqual([ROOM]);
    expect(p.sync).toEqual({ at: 200, dirty: false });
    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  it("reads the account's copy from its own d tag", async () => {
    await sync.hydrateDmPrefs(PK);
    expect(fetchAlertPrefs).toHaveBeenCalledWith(6000, "brainstorm.world/dm-prefs");
  });

  it("ignores what came back if the account switched while it was fetching", async () => {
    fetchAlertPrefs.mockImplementation(async () => {
      activeAccount.mockReturnValue({ pubkey: "d".repeat(64) });
      return { v: 1, updated_at: 200, pinned: [OTHER_ROOM] };
    });
    await sync.hydrateDmPrefs(PK);
    expect(prefs.readDmPrefs(PK).pinned).toEqual([]);
  });

  it("sends up a change that never made it", async () => {
    prefs.applySyncedDmPrefs(PK, { pinned: [ROOM] }, { at: 300, dirty: true });
    fetchAlertPrefs.mockResolvedValue({ v: 1, updated_at: 200, pinned: [], muted: [], accepted: [] });

    await sync.hydrateDmPrefs(PK);

    expect(published()).toMatchObject({ updated_at: 300, pinned: [ROOM] });
    expect(prefs.readDmPrefs(PK).sync).toEqual({ at: 300, dirty: false });
  });
});
