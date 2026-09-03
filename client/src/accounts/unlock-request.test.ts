// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { firstValueFrom } from "rxjs";
import { filter } from "rxjs/operators";

import { isUnlockCancelled, type LocalSigner, type RecoveryPasswordRequest } from "./local-signer";
import { requestRecoveryPassword, unlockPrompt$, type UnlockPrompt } from "./unlock-request";

const PUBKEY = "a".repeat(64);

/** A signer stand-in: the store only ever reads its pubkey. */
function fakeRequest(attempt = vi.fn(async () => ({ ok: true }) as const)): RecoveryPasswordRequest {
  return { signer: { pubkey: PUBKEY } as unknown as LocalSigner, attempt };
}

/** The next prompt to appear on screen. */
function nextPrompt(): Promise<UnlockPrompt> {
  return firstValueFrom(unlockPrompt$.pipe(filter((p): p is UnlockPrompt => p !== null)));
}

describe("raising the unlock prompt", () => {
  it("shows the identity being unlocked, as an npub", async () => {
    const pending = requestRecoveryPassword(fakeRequest());
    const prompt = await nextPrompt();

    expect(prompt.pubkey).toBe(PUBKEY);
    expect(prompt.npub).toMatch(/^npub1/);

    await prompt.submit("hunter2hunter2");
    await pending;
  });

  it("resolves the waiting action once a password opens the Backup, and closes", async () => {
    const attempt = vi.fn(async () => ({ ok: true }) as const);
    const pending = requestRecoveryPassword(fakeRequest(attempt));
    const prompt = await nextPrompt();

    await expect(prompt.submit("hunter2hunter2")).resolves.toEqual({ ok: true });
    await expect(pending).resolves.toBeUndefined();
    expect(attempt).toHaveBeenCalledWith("hunter2hunter2");
    expect(unlockPrompt$.value).toBeNull();
  });

  it("stays open on a wrong password, and reports why", async () => {
    const attempt = vi
      .fn<[string], Promise<{ ok: boolean; reason?: string }>>()
      .mockResolvedValueOnce({ ok: false, reason: "wrong-password" })
      .mockResolvedValueOnce({ ok: true });
    const pending = requestRecoveryPassword(
      fakeRequest(attempt as unknown as RecoveryPasswordRequest["attempt"]),
    );
    const prompt = await nextPrompt();

    await expect(prompt.submit("nope")).resolves.toEqual({ ok: false, reason: "wrong-password" });
    expect(unlockPrompt$.value).toBe(prompt); // same dialog, still asking

    await prompt.submit("hunter2hunter2");
    await pending;
    expect(unlockPrompt$.value).toBeNull();
  });

  it("rejects the waiting action with a cancel, which is not an error state", async () => {
    const pending = requestRecoveryPassword(fakeRequest());
    const prompt = await nextPrompt();

    prompt.cancel();

    const error = await pending.catch((e) => e);
    expect(isUnlockCancelled(error)).toBe(true);
    expect(unlockPrompt$.value).toBeNull();
  });

  // Two signs on one Account share a single unlock, so this covers the rarer case:
  // two Accounts asking at once must not stack two dialogs on top of each other.
  it("only ever shows one prompt at a time", async () => {
    const first = requestRecoveryPassword(fakeRequest());
    const second = requestRecoveryPassword(fakeRequest());

    const shown = await nextPrompt();
    expect(unlockPrompt$.value).toBe(shown);

    shown.cancel();
    await expect(first).rejects.toSatisfy(isUnlockCancelled);

    const queued = await nextPrompt();
    expect(queued).not.toBe(shown);
    await queued.submit("hunter2hunter2");
    await second;
  });
});
