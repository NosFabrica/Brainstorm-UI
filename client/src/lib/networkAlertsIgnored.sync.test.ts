// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishAlertPrefs = vi.fn();
/** The account's copy, as `fetchPrivateAppData` reads it: none, unless a test says otherwise. */
const fetchPrivateAppData = vi.fn(async (..._args: unknown[]) => ({ status: "absent" }) as unknown);

vi.mock("@/services/nostr", () => ({
  ALERT_PREFS_D_TAG: "brainstorm.world/alert-prefs",
  publishAlertPrefs: (...args: unknown[]) => publishAlertPrefs(...args),
  fetchPrivateAppData: (...args: unknown[]) => fetchPrivateAppData(...args),
}));

/** The account's copy holds `data`. */
const remoteHas = (data: unknown, id = "1".repeat(64)) =>
  fetchPrivateAppData.mockResolvedValue({ status: "found", id, createdAt: 100, data });
/** What the last publish sent. */
const published = () => publishAlertPrefs.mock.calls.at(-1)?.[0] as { entries: { pubkey: string }[] };
const publishedKeys = () =>
  published()
    .entries.map((e) => e.pubkey)
    .sort();

const OBSERVER = "a".repeat(64);

let lib: typeof import("./networkAlertsIgnored");

/** Whether the publish was told nobody asked for it. */
const askedInBackground = () =>
  publishAlertPrefs.mock.calls.every((call) => (call[2] as { background?: boolean })?.background);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  localStorage.clear();
  publishAlertPrefs.mockResolvedValue({ success: true });
  fetchPrivateAppData.mockResolvedValue({ status: "absent" });
  lib = await import("./networkAlertsIgnored");
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A publish that rides along with a page load is nobody's request, so a Locked
 * Account must not be asked to unlock for it — that is exactly what
 * `canSignSilently` and the `background` flag exist to enforce.
 */
describe("the flush that runs on app load", () => {
  it("does not ask a locked account to unlock", async () => {
    localStorage.setItem(`brainstorm_alert_prefs_dirty:${OBSERVER}`, "1");
    publishAlertPrefs.mockResolvedValue({ success: false, deferred: true });

    await lib.hydrateIgnoredFromNostr(OBSERVER);
    await lib.whenIgnoreSyncSettles();

    expect(publishAlertPrefs).toHaveBeenCalled();
    expect(askedInBackground()).toBe(true);
  });

  // A deferred publish is waiting on the user, not on the network. Re-arming a
  // 15-second timer against it means asking again on a clock.
  it("does not retry a deferred publish on a timer", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({ success: false, deferred: true });

    await lib.flushIgnoredToNostr(OBSERVER, { background: true });
    publishAlertPrefs.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  /**
   * A cancelled unlock has no `error`, so the old `isPermanentFailure(undefined)`
   * was false and the transient branch re-armed the timer — the recovery-password
   * modal every fifteen seconds until the user gave in or left.
   */
  it("does not reopen the unlock modal every fifteen seconds", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({ success: false, cancelled: true });

    await lib.flushIgnoredToNostr(OBSERVER);
    publishAlertPrefs.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  /**
   * A signer that has gone quiet needs a person to open or re-pair it. On a timer
   * that is an endless loop of NIP-46 requests, each waiting out its own 30s
   * deadline — introduced the moment a silent signer stopped being reported as
   * "No signer available" and started coming back as a plain error.
   */
  it("does not hammer a signer that has gone quiet", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({
      success: false,
      error: "Your signer didn't answer.",
      signerUnreachable: true,
    });

    await lib.flushIgnoredToNostr(OBSERVER);
    publishAlertPrefs.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  it("does not prompt again every fifteen seconds after the signer declined", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({ success: false, error: "denied", declined: true });

    await lib.flushIgnoredToNostr(OBSERVER);
    publishAlertPrefs.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(publishAlertPrefs).not.toHaveBeenCalled();
  });

  // A relay failure is the case the retry was written for, and it stays.
  it("still retries a genuine relay failure", async () => {
    vi.useFakeTimers();
    publishAlertPrefs.mockResolvedValue({ success: false, error: "All relays failed" });

    await lib.flushIgnoredToNostr(OBSERVER);
    publishAlertPrefs.mockClear();
    await vi.advanceTimersByTimeAsync(16_000);

    expect(publishAlertPrefs).toHaveBeenCalled();
  });

  // A user-initiated change should still prompt — that one they did ask for.
  it("lets a deliberate change ask for the unlock", async () => {
    await lib.flushIgnoredToNostr(OBSERVER);

    expect(publishAlertPrefs).toHaveBeenCalled();
    expect(askedInBackground()).toBe(false);
  });
});

/**
 * The dirty re-flush above is only one of the publishes a page load can trigger.
 * Both mount effects in `NetworkAlertsModule` end at `persist()`, which published
 * in the foreground — so a Locked Account opening the dashboard with one
 * remote-only ignore entry got the Recovery-password modal having asked for
 * nothing.
 */
describe("the publishes the dashboard's mount effects trigger", () => {
  const REMOTE = "b".repeat(64);

  it("merges a remote ignore list without asking a locked account to unlock", async () => {
    // This device has one the account's copy lacks, so the merge goes up.
    localStorage.setItem(
      `brainstorm_network_alerts_ignored:${OBSERVER}`,
      JSON.stringify({ entries: [{ pubkey: "c".repeat(64), atReports: 1, at: 5 }] }),
    );
    remoteHas({ entries: [{ pubkey: REMOTE, atReports: 3 }] });

    await lib.hydrateIgnoredFromNostr(OBSERVER);
    await lib.whenIgnoreSyncSettles();

    expect(publishAlertPrefs).toHaveBeenCalled();
    expect(askedInBackground()).toBe(true);
    expect(lib.ignoredAlertMap(OBSERVER).has(REMOTE)).toBe(true);
  });

  it("backfills a missing baseline without asking a locked account to unlock", async () => {
    remoteHas({ pubkeys: [REMOTE] }); // legacy shape → atReports null
    await lib.hydrateIgnoredFromNostr(OBSERVER);
    await lib.whenIgnoreSyncSettles();
    publishAlertPrefs.mockClear();

    lib.backfillIgnoredBaselines(OBSERVER, [{ pubkey: REMOTE, verifiedReporterCount: 7 }]);
    await lib.whenIgnoreSyncSettles();

    expect(publishAlertPrefs).toHaveBeenCalled();
    expect(askedInBackground()).toBe(true);
  });

  // Ignoring an account is a deliberate act, and that one may still prompt.
  it("still asks when the user ignores an account themselves", async () => {
    lib.ignoreAlert(OBSERVER, REMOTE, 3);
    await lib.whenIgnoreSyncSettles();

    expect(publishAlertPrefs).toHaveBeenCalled();
    expect(askedInBackground()).toBe(false);
  });
});

/**
 * The NIP-78 copy is replaced whole by every publish. Each one used to send
 * this device's list alone, read through a fetch that said "none" both when
 * there was none and when it couldn't tell, and merged by union.
 */
describe("keeping the account's list whole across devices", () => {
  const X = "1".repeat(64);
  const Y = "2".repeat(64);
  const Z = "3".repeat(64);

  it("an ignore on a new device adds to the account's list rather than replacing it", async () => {
    remoteHas({
      entries: [
        { pubkey: X, atReports: 2 },
        { pubkey: Y, atReports: 4 },
      ],
    });

    lib.ignoreAlert(OBSERVER, Z, 1);
    await lib.whenIgnoreSyncSettles();

    expect(publishedKeys()).toEqual([X, Y, Z]);
  });

  it("publishes nothing while the account's list can't be read, and keeps the change waiting", async () => {
    fetchPrivateAppData.mockResolvedValue({ status: "unknown" });

    lib.ignoreAlert(OBSERVER, Z, 1);
    await lib.whenIgnoreSyncSettles();

    expect(publishAlertPrefs).not.toHaveBeenCalled();
    expect(lib.hasUnsyncedIgnores(OBSERVER)).toBe(true);
    expect(lib.ignoredAlertMap(OBSERVER).has(Z)).toBe(true);
  });

  it("an un-ignore stays un-ignored, even against a copy that still has it", async () => {
    remoteHas({
      entries: [
        { pubkey: X, atReports: 2 },
        { pubkey: Y, atReports: 4 },
      ],
    });
    await lib.hydrateIgnoredFromNostr(OBSERVER);

    lib.unignoreAlert(OBSERVER, X);
    await lib.whenIgnoreSyncSettles();
    expect(publishedKeys()).toEqual([Y]);

    // The relays still serve the old copy; the merge must not bring X back.
    const map = await lib.hydrateIgnoredFromNostr(OBSERVER);
    expect(map.has(X)).toBe(false);
    expect(map.has(Y)).toBe(true);
  });

  it("an un-ignore made on another device takes the entry off this one", async () => {
    lib.ignoreAlert(OBSERVER, X, 2);
    await lib.whenIgnoreSyncSettles();
    remoteHas({ entries: [], removed: [{ pubkey: X, at: Date.now() + 1000 }] }, "9".repeat(64));

    const map = await lib.hydrateIgnoredFromNostr(OBSERVER);

    expect(map.has(X)).toBe(false);
  });

  it("publishes past the copy it merged onto", async () => {
    fetchPrivateAppData.mockResolvedValue({
      status: "found",
      id: "1".repeat(64),
      createdAt: 4_000_000_000,
      data: { entries: [] },
    });

    lib.ignoreAlert(OBSERVER, Z, 1);
    await lib.whenIgnoreSyncSettles();

    expect((publishAlertPrefs.mock.calls.at(-1)?.[2] as { createdAt: number }).createdAt).toBe(4_000_000_001);
  });
});
