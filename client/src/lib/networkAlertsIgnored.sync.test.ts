// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishAlertPrefs = vi.fn();
const fetchAlertPrefs = vi.fn(async () => null as unknown);

vi.mock("@/services/nostr", () => ({
  publishAlertPrefs: (...args: unknown[]) => publishAlertPrefs(...args),
  fetchAlertPrefs: () => fetchAlertPrefs(),
}));

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
  fetchAlertPrefs.mockResolvedValue(null);
  lib = await import("./networkAlertsIgnored");
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * A publish that rides along with a page load is nobody's request, so a Locked
 * Account must not be asked to unlock for it — that is exactly what
 * `canSignSilently` and the `background` flag exist to enforce, and
 * `scoreJournal` was already updated for it.
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
