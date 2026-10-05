// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrivateAppData } from "@/services/nostr";

const publishAlertPrefs = vi.fn();
const fetchPrivateAppData = vi.fn();
const activeAccount = vi.fn();

vi.mock("@/services/nostr", () => ({
  DM_PREFS_D_TAG: "brainstorm.world/dm-prefs",
  publishAlertPrefs: (...args: unknown[]) => publishAlertPrefs(...args),
  fetchPrivateAppData: (...args: unknown[]) => fetchPrivateAppData(...args),
}));

vi.mock("@/accounts/signing", () => ({
  activeAccount: () => activeAccount(),
  hasExternalSigner: (account: { external?: boolean }) => !!account.external,
}));

const PK = "a".repeat(64);
const ROOM = `${"b".repeat(64)},${PK}`;
const OTHER_ROOM = `${"c".repeat(64)},${PK}`;

let prefs: typeof import("./prefs");
let sync: typeof import("./prefsSync");

const found = (data: Record<string, unknown>, id = "e1", createdAt = 1000): PrivateAppData => ({
  status: "found",
  id,
  createdAt,
  data,
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  localStorage.clear();
  activeAccount.mockReturnValue({ pubkey: PK });
  publishAlertPrefs.mockResolvedValue({ success: true });
  fetchPrivateAppData.mockResolvedValue({ status: "absent" });
  prefs = await import("./prefs");
  sync = await import("./prefsSync");
});

afterEach(() => {
  vi.useRealTimers();
});

/** The blob the last publish carried (before `publishAlertPrefs` encrypts it). */
const published = () => publishAlertPrefs.mock.calls.at(-1)?.[0] as Record<string, unknown>;
const joined = (at: number, dirty = false) => ({ at, dirty, joined: true });

describe("reconciling this device with the account's copy", () => {
  const local = (over: Partial<import("./prefs").DmPrefs> = {}) => ({ ...prefs.readDmPrefs(PK), ...over });
  const remote = { updatedAt: 200, pinned: [OTHER_ROOM], muted: [], accepted: [] };

  it("takes the account's copy when it is newer and nothing changed here", () => {
    const plan = sync.reconcileDmPrefs(local({ pinned: [ROOM], sync: joined(100) }), remote, 999);
    expect(plan).toEqual({
      write: { fields: { pinned: [OTHER_ROOM], muted: [], accepted: [] }, sync: joined(200) },
      publish: false,
    });
  });

  it("merges a change made here into a newer account copy instead of dropping it", () => {
    const base = { pinned: [], muted: [], accepted: [] };
    const plan = sync.reconcileDmPrefs(local({ pinned: [ROOM], sync: { ...joined(100, true), base } }), remote, 999);
    expect(plan.write?.fields.pinned).toEqual([ROOM, OTHER_ROOM]);
    expect(plan.write?.sync).toMatchObject({ at: 201, dirty: true, joined: true });
    expect(plan.publish).toBe(true);
  });

  it("keeps another device's edit when this one, stale, edits something else", () => {
    // Both saw: C muted and T muted. The other device unmuted T; this one, not knowing, pins B.
    const T = `${"d".repeat(64)},${PK}`;
    const base = { pinned: [], muted: [OTHER_ROOM, T], accepted: [] };
    const plan = sync.reconcileDmPrefs(
      local({ pinned: [ROOM], muted: [OTHER_ROOM, T], sync: { ...joined(100, true), base } }),
      { updatedAt: 200, pinned: [], muted: [OTHER_ROOM], accepted: [] },
      999,
    );
    expect(plan.write?.fields).toMatchObject({ pinned: [ROOM], muted: [OTHER_ROOM] });
    expect(plan.publish).toBe(true);
  });

  it("lets a removal here win over the same item in the account's copy", () => {
    const base = { pinned: [ROOM], muted: [], accepted: [] };
    const plan = sync.reconcileDmPrefs(
      local({ pinned: [], sync: { ...joined(100, true), base } }),
      { updatedAt: 200, pinned: [OTHER_ROOM, ROOM], muted: [], accepted: [] },
      999,
    );
    expect(plan.write?.fields.pinned).toEqual([OTHER_ROOM]);
  });

  it("sends this device's copy up when it is newer", () => {
    const plan = sync.reconcileDmPrefs(local({ pinned: [ROOM], sync: joined(300, true) }), remote, 999);
    expect(plan.publish).toBe(true);
  });

  it("merges both on a device's first sync, so pins made before sync existed survive", () => {
    const plan = sync.reconcileDmPrefs(local({ pinned: [ROOM] }), remote, 999);
    expect(plan).toMatchObject({
      write: { fields: { pinned: [OTHER_ROOM, ROOM] }, sync: { at: 999, dirty: true, joined: true } },
      publish: true,
    });
  });

  it("merges a device that changed something before its first merge, rather than publishing over", () => {
    const plan = sync.reconcileDmPrefs(
      local({ pinned: [ROOM], sync: { at: 5000, dirty: true, joined: false } }),
      remote,
      999,
    );
    expect(plan.write?.fields.pinned).toEqual([OTHER_ROOM, ROOM]);
  });

  it("keeps this device's list for a field the account's copy doesn't carry", () => {
    const plan = sync.reconcileDmPrefs(local({ muted: [ROOM], sync: joined(100) }), { updatedAt: 200 }, 999);
    expect(plan.write?.fields).toEqual({});
  });

  it("does nothing on a read that couldn't tell", () => {
    expect(sync.reconcileDmPrefs(local({ pinned: [ROOM] }), "unknown", 999)).toEqual({ publish: false });
    expect(sync.reconcileDmPrefs(local({ pinned: [ROOM], sync: joined(1, true) }), "unknown", 999)).toEqual({
      publish: false,
    });
  });

  it("publishes a first copy only when the account is proven to have none", () => {
    expect(sync.reconcileDmPrefs(local({ pinned: [ROOM] }), "absent", 999)).toEqual({
      write: { fields: {}, sync: { at: 999, dirty: true, joined: false } },
      publish: true,
    });
    // Nothing to send: joined now, so the first pin goes straight out.
    expect(sync.reconcileDmPrefs(local(), "absent", 999)).toEqual({
      write: { fields: {}, sync: { at: 0, dirty: false, joined: true } },
      publish: false,
    });
  });

  it("reads only well-formed content, with the same sanitizer as local rows", () => {
    expect(sync.parseRemoteDmPrefs(null)).toBeNull();
    expect(sync.parseRemoteDmPrefs({ pinned: [ROOM] })).toBeNull();
    expect(sync.parseRemoteDmPrefs({ updated_at: 5, pinned: [ROOM, 7], muted: "x" })).toEqual({
      updatedAt: 5,
      pinned: [ROOM],
    });
  });
});

describe("the published copy", () => {
  it("stays under NIP-44's plaintext limit, dropping the oldest accepted requests first", () => {
    const accepted = Array.from({ length: 1000 }, (_, i) => `${i.toString(16).padStart(64, "0")},${PK}`);
    const fitted = sync.fitDmPrefsPayload({ v: 1, updated_at: 1, pinned: [ROOM], muted: [ROOM], accepted });
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(60_000);
    expect(fitted.pinned).toEqual([ROOM]);
    expect(fitted.muted).toEqual([ROOM]);
    expect(fitted.accepted.at(-1)).toBe(accepted.at(-1));
    expect(fitted.accepted.length).toBeLessThan(1000);
  });

  it("is left alone when it fits", () => {
    const payload = { pinned: [ROOM], muted: [], accepted: [] };
    expect(sync.fitDmPrefsPayload(payload)).toBe(payload);
  });
});

describe("pinning a chat", () => {
  const joinedDevice = () => prefs.applySyncedDmPrefs(PK, {}, joined(100));

  it("publishes the synced fields once a burst of toggles settles", async () => {
    vi.useFakeTimers();
    joinedDevice();
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    prefs.setRoomMuted(PK, ROOM, true);
    prefs.setRoomPinned(PK, OTHER_ROOM, true);
    expect(prefs.readDmPrefs(PK).sync?.dirty).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);

    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
    const [blob, dTag, opts] = publishAlertPrefs.mock.calls[0];
    expect(dTag).toBe("brainstorm.world/dm-prefs");
    expect(opts).toMatchObject({ background: true });
    expect(blob).toMatchObject({ v: 1, pinned: [OTHER_ROOM, ROOM], muted: [ROOM], accepted: [] });
    expect(prefs.readDmPrefs(PK).sync?.dirty).toBe(false);
    stop();
  });

  it("asks an extension when the reader pins: their act, their signer's prompt", async () => {
    vi.useFakeTimers();
    activeAccount.mockReturnValue({ pubkey: PK, external: true });
    joinedDevice();
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
    expect(publishAlertPrefs.mock.calls[0][2]).toMatchObject({ background: false });
    stop();
  });

  it("doesn't publish for changes that don't sync", async () => {
    vi.useFakeTimers();
    joinedDevice();
    const stop = sync.startDmPrefsSync();
    prefs.markRoomRead(PK, ROOM, 50);
    prefs.setRoomTimer(PK, ROOM, 3600);
    await vi.advanceTimersByTimeAsync(2000);
    expect(publishAlertPrefs).not.toHaveBeenCalled();
    stop();
  });

  it("before the first merge, merges instead of publishing over the account's copy", async () => {
    vi.useFakeTimers();
    fetchPrivateAppData.mockResolvedValue(found({ updated_at: 200, pinned: [OTHER_ROOM], muted: [], accepted: [] }));
    const stop = sync.startDmPrefsSync();

    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);

    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
    expect(published()).toMatchObject({ pinned: [OTHER_ROOM, ROOM] });
    stop();
  });

  it("stamps an edit past the copy it last saw, so a fast clock elsewhere can't undo it", () => {
    prefs.applySyncedDmPrefs(PK, {}, joined(Date.now() + 600_000));
    prefs.setRoomPinned(PK, ROOM, true);
    expect(prefs.readDmPrefs(PK).sync!.at).toBeGreaterThan(Date.now() + 600_000);
  });

  it("doesn't publish again once the account's copy was adopted over it", async () => {
    vi.useFakeTimers();
    joinedDevice();
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    prefs.applySyncedDmPrefs(PK, { pinned: [OTHER_ROOM] }, joined(Date.now() + 1000));
    await vi.advanceTimersByTimeAsync(2000);
    expect(publishAlertPrefs).not.toHaveBeenCalled();
    stop();
  });

  it("stays dirty for later when the account is locked, without retrying on a clock", async () => {
    vi.useFakeTimers();
    joinedDevice();
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
    joinedDevice();
    publishAlertPrefs.mockResolvedValue({ success: false, error: "All relays failed" });
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    // Within one refresh period: the open-tab refresh is itself the next sync.
    await vi.advanceTimersByTimeAsync(100_000);
    expect(publishAlertPrefs).toHaveBeenCalledTimes(4);
    stop();
  });

  it("doesn't ask a signer that said no again on a clock", async () => {
    vi.useFakeTimers();
    joinedDevice();
    publishAlertPrefs.mockResolvedValue({ success: false, error: "declined", declined: true });
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
    expect(prefs.readDmPrefs(PK).sync?.dirty).toBe(true);
    stop();
  });

  it("reads the account's copy before publishing, so a stale tab doesn't undo another device", async () => {
    vi.useFakeTimers();
    const T = `${"d".repeat(64)},${PK}`;
    // This tab last saw T and OTHER muted.
    fetchPrivateAppData.mockResolvedValue(
      found({ updated_at: 200, pinned: [], muted: [OTHER_ROOM, T], accepted: [] }, "e1"),
    );
    await sync.hydrateDmPrefs(PK);
    // Meanwhile another device unmutes T.
    fetchPrivateAppData.mockResolvedValue(
      found({ updated_at: 300, pinned: [], muted: [OTHER_ROOM], accepted: [] }, "e2"),
    );
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(published()).toMatchObject({ pinned: [ROOM], muted: [OTHER_ROOM] });
    expect(prefs.readDmPrefs(PK).muted).toEqual([OTHER_ROOM]);
    stop();
  });

  it("publishes nothing on a read that couldn't tell, and tries again later", async () => {
    vi.useFakeTimers();
    joinedDevice();
    fetchPrivateAppData.mockResolvedValue({ status: "unknown" });
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(publishAlertPrefs).not.toHaveBeenCalled();
    fetchPrivateAppData.mockResolvedValue({ status: "absent" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(published()).toMatchObject({ pinned: [ROOM] });
    stop();
  });

  it("picks up another device's change when the tab comes back into view", async () => {
    fetchPrivateAppData.mockResolvedValue(found({ updated_at: 200, pinned: [], muted: [], accepted: [] }, "e1"));
    await sync.hydrateDmPrefs(PK);
    const stop = sync.startDmPrefsSync();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    fetchPrivateAppData.mockResolvedValue(
      found({ updated_at: 300, pinned: [OTHER_ROOM], muted: [], accepted: [] }, "e2"),
    );
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(prefs.readDmPrefs(PK).pinned).toEqual([OTHER_ROOM]);
    stop();
  });

  it("leaves an extension's copy alone on focus and on the clock: each read or write would prompt", async () => {
    activeAccount.mockReturnValue({ pubkey: PK, external: true });
    const stop = sync.startDmPrefsSync();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchPrivateAppData).not.toHaveBeenCalled();
    expect(publishAlertPrefs).not.toHaveBeenCalled();
    stop();
  });

  it("schedules no retry once stopped", async () => {
    vi.useFakeTimers();
    joinedDevice();
    let fail!: (v: unknown) => void;
    publishAlertPrefs.mockReturnValue(new Promise((resolve) => (fail = resolve)));
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);
    stop();
    fail({ success: false, error: "All relays failed" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(publishAlertPrefs).toHaveBeenCalledTimes(1);
  });

  it("leaves no row behind when sign-out lands mid-publish", async () => {
    vi.useFakeTimers();
    joinedDevice();
    let land!: (v: unknown) => void;
    publishAlertPrefs.mockReturnValue(new Promise((resolve) => (land = resolve)));
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);

    activeAccount.mockReturnValue(undefined);
    localStorage.clear();
    prefs.forgetDmPrefs();
    land({ success: true });
    await vi.advanceTimersByTimeAsync(0);

    expect(localStorage.getItem(`brainstorm_dm_prefs:${PK}`)).toBeNull();
    stop();
  });

  it("signs past the newest copy seen, so relays keep it even when this clock lags", async () => {
    vi.useFakeTimers();
    const future = Math.floor(Date.now() / 1000) + 3600;
    fetchPrivateAppData.mockResolvedValue(
      found({ updated_at: 200, pinned: [], muted: [], accepted: [] }, "e1", future),
    );
    await sync.hydrateDmPrefs(PK);
    const stop = sync.startDmPrefsSync();
    prefs.setRoomPinned(PK, ROOM, true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(publishAlertPrefs.mock.calls[0][2]).toMatchObject({ createdAt: future + 1 });
    stop();
  });
});

describe("opening the inbox", () => {
  it("brings in pins made on another device", async () => {
    prefs.applySyncedDmPrefs(PK, { pinned: [ROOM] }, joined(100));
    fetchPrivateAppData.mockResolvedValue(
      found({ v: 1, updated_at: 200, pinned: [OTHER_ROOM], muted: [], accepted: [ROOM] }),
    );

    await sync.hydrateDmPrefs(PK);

    const p = prefs.readDmPrefs(PK);
    expect(p.pinned).toEqual([OTHER_ROOM]);
    expect(p.accepted).toEqual([ROOM]);
    expect(p.sync).toMatchObject(joined(200));
    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  it("never publishes over the account's copy on a read that couldn't tell", async () => {
    prefs.updateDmPrefs(PK, (p) => ({ ...p, pinned: [ROOM] }));
    fetchPrivateAppData.mockResolvedValue({ status: "unknown" });
    await sync.hydrateDmPrefs(PK);
    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  it("publishes a first copy when the account proves to have none, and is joined after", async () => {
    prefs.updateDmPrefs(PK, (p) => ({ ...p, pinned: [ROOM] }));
    await sync.hydrateDmPrefs(PK);
    expect(published()).toMatchObject({ pinned: [ROOM] });
    expect(prefs.readDmPrefs(PK).sync).toMatchObject({ dirty: false, joined: true });
  });

  it("reads once for boot and an open straight after, and skips decrypting what it has seen", async () => {
    fetchPrivateAppData.mockResolvedValue(found({ updated_at: 200, pinned: [], muted: [], accepted: [] }));
    await Promise.all([sync.hydrateDmPrefs(PK), sync.hydrateDmPrefs(PK)]);
    await sync.hydrateDmPrefs(PK);
    expect(fetchPrivateAppData).toHaveBeenCalledTimes(1);
    expect(fetchPrivateAppData).toHaveBeenCalledWith("brainstorm.world/dm-prefs", { knownId: undefined });

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 60_000);
    fetchPrivateAppData.mockResolvedValue({ status: "unchanged", id: "e1", createdAt: 1000 });
    await sync.hydrateDmPrefs(PK);
    expect(fetchPrivateAppData).toHaveBeenLastCalledWith("brainstorm.world/dm-prefs", { knownId: "e1" });
    expect(prefs.readDmPrefs(PK).sync).toMatchObject(joined(200));
  });

  it("ignores what came back if the account switched while it was fetching", async () => {
    fetchPrivateAppData.mockImplementation(async () => {
      activeAccount.mockReturnValue({ pubkey: "d".repeat(64) });
      return found({ v: 1, updated_at: 200, pinned: [OTHER_ROOM] });
    });
    await sync.hydrateDmPrefs(PK);
    expect(prefs.readDmPrefs(PK).pinned).toEqual([]);
  });

  it("sends up a change that never made it", async () => {
    prefs.applySyncedDmPrefs(PK, { pinned: [ROOM] }, joined(300, true));
    fetchPrivateAppData.mockResolvedValue(found({ v: 1, updated_at: 200, pinned: [], muted: [], accepted: [] }));

    await sync.hydrateDmPrefs(PK);

    expect(published()).toMatchObject({ updated_at: 300, pinned: [ROOM] });
    expect(prefs.readDmPrefs(PK).sync).toMatchObject(joined(300));
  });
});
