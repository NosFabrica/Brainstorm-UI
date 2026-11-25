// @vitest-environment jsdom
/**
 * Every Amber request is an app switch, and the library reads its answer off the
 * clipboard on the next `visibilitychange` — registering the pending request
 * 500ms *after* the switch. An auto-approving Amber that returns inside that
 * window is never read, a clipboard permission the user never grants never
 * resolves, and a build that stopped answering through the clipboard looks the
 * same. All three used to hold "Waiting for Amber" for the life of the page.
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { AmberClipboardSigner } from "applesauce-signers/signers/amber-clipboard-signer";

import { AMBER_TIMEOUT_MS, TimedAmberSigner } from "./amber";
import { isRemoteSignerTimeout } from "./remote-signer";

// jsdom is not Android, and the library refuses before it ever switches apps.
// The deadline is about what happens *after* the switch, so stand the guard down.
const supported = Object.getOwnPropertyDescriptor(AmberClipboardSigner, "SUPPORTED");
beforeEach(() => {
  Object.defineProperty(AmberClipboardSigner, "SUPPORTED", { value: true, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  if (supported) Object.defineProperty(AmberClipboardSigner, "SUPPORTED", supported);
});

describe("an Amber that never answers", () => {
  it("gives up rather than waiting for the life of the page", async () => {
    vi.useFakeTimers();
    const signer = new TimedAmberSigner();
    // The app switch itself: nothing comes back, as when the clipboard read is
    // never permitted or the answer lands outside the library's blind window.
    vi.spyOn(window, "open").mockReturnValue(null);

    const waiting = signer.getPublicKey();
    const settled = expect(waiting).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(AMBER_TIMEOUT_MS + 1_000);
    await settled;

    await expect(waiting.catch((e) => isRemoteSignerTimeout(e))).resolves.toBe(true);
  });

  it("says where to look, since the request may be sitting in the app", async () => {
    vi.useFakeTimers();
    const signer = new TimedAmberSigner();
    vi.spyOn(window, "open").mockReturnValue(null);

    // `nip44Encrypt` rather than `signEvent`: signing hashes the draft, and
    // jsdom's Uint8Array is a realm @noble refuses. Every method takes the same
    // app switch, so any of them proves the deadline.
    const waiting = signer.nip44Encrypt("a".repeat(64), "hi");
    const settled = expect(waiting).rejects.toThrow(/Amber didn't answer/);
    await vi.advanceTimersByTimeAsync(AMBER_TIMEOUT_MS + 1_000);
    await settled;
  });
});

describe("a request Amber was too late for", () => {
  // Timed out, the library still held it as pending: the next return to the app read
  // the clipboard into a request nobody was waiting for any more.
  it("is let go of, so a late answer is read into nothing", async () => {
    vi.useFakeTimers();
    const signer = new TimedAmberSigner();
    vi.spyOn(window, "open").mockReturnValue(null);
    const rejectPending = vi.spyOn(signer, "rejectPending");

    const waiting = signer.nip44Decrypt("a".repeat(64), "ciphertext");
    const settled = expect(waiting).rejects.toThrow(/Amber didn't answer/);
    await vi.advanceTimersByTimeAsync(AMBER_TIMEOUT_MS + 1_000);
    await settled;

    // Once when the request was made (the library's own), once when it ran out.
    expect(rejectPending).toHaveBeenCalledTimes(2);
  });
});
