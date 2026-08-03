// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey, verifyEvent } from "nostr-tools/pure";

import { LocalAccount } from "./local-account";
import type { BrainstormAccount } from "./metadata";
import {
  activeAccount,
  canSignSilently,
  decryptFromSelf,
  encryptToSelf,
  NoSignerError,
  requireActiveAccount,
  signAs,
} from "./signing";
import { createFakeUnlockCache, LOW_LOGN, PASSWORD } from "./test-fakes";

/** An Account that signs without asking — an extension or a bunker. */
class AlwaysSignableAccount extends BaseAccount<PrivateKeySigner, never, any> {
  static readonly type = "test-always-signable";
}

function signableAccount(): BrainstormAccount {
  const secretKey = generateSecretKey();
  const account = new AlwaysSignableAccount(
    getPublicKey(secretKey),
    new PrivateKeySigner(secretKey),
  );
  account.metadata = { remembered: true };
  return account as unknown as BrainstormAccount;
}

/** A local Account with both at-rest forms, Locked until something unlocks it. */
async function lockedLocalAccount(requestPassword = vi.fn(async () => PASSWORD)) {
  const unlockCache = createFakeUnlockCache();
  const account = await LocalAccount.fromKey(generateSecretKey(), {
    password: PASSWORD,
    logn: LOW_LOGN,
    unlockCache,
    requestPassword,
  });
  account.signer.lock();
  return { account: account as unknown as BrainstormAccount, unlockCache, requestPassword };
}

describe("signing as an account", () => {
  it("signs with that account's key, and stamps the pubkey itself", async () => {
    const account = signableAccount();

    const event = await signAs(account, { kind: 1, tags: [], content: "hello" });

    expect(event.pubkey).toBe(account.pubkey);
    expect(verifyEvent(event)).toBe(true);
  });

  it("defaults created_at to now, and lets a caller pin it", async () => {
    const account = signableAccount();

    const now = await signAs(account, { kind: 1, tags: [], content: "" });
    const pinned = await signAs(account, { kind: 1, tags: [], content: "", created_at: 1700000000 });

    expect(now.created_at).toBeGreaterThan(1700000000);
    expect(pinned.created_at).toBe(1700000000);
  });

  it("unlocks a Locked local key on the way through, silently where it can", async () => {
    const { account, requestPassword } = await lockedLocalAccount();

    const event = await signAs(account, { kind: 1, tags: [], content: "hi" });

    expect(event.pubkey).toBe(account.pubkey);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("falls through to the Recovery password once the Unlock cache is gone", async () => {
    const { account, unlockCache, requestPassword } = await lockedLocalAccount();
    unlockCache.wipe();

    const event = await signAs(account, { kind: 1, tags: [], content: "hi" });

    expect(event.pubkey).toBe(account.pubkey);
    expect(requestPassword).toHaveBeenCalledTimes(1);
  });

  // The v1 bug this refactor exists to make impossible: a local Account's events
  // were signed by whatever extension happened to be installed.
  it("never reaches for window.nostr when the account holds its own key", async () => {
    const extensionKey = generateSecretKey();
    (globalThis as any).window = {
      nostr: {
        getPublicKey: async () => getPublicKey(extensionKey),
        signEvent: async () => {
          throw new Error("the extension must not be asked");
        },
      },
    };
    try {
      const { account } = await lockedLocalAccount();

      const event = await signAs(account, { kind: 3, tags: [], content: "" });

      expect(event.pubkey).toBe(account.pubkey);
      expect(event.pubkey).not.toBe(getPublicKey(extensionKey));
    } finally {
      delete (globalThis as any).window;
    }
  });
});

describe("the active account", () => {
  it("is absent on a signed-out browser, and asking for one throws", () => {
    expect(activeAccount()).toBeUndefined();
    expect(() => requireActiveAccount()).toThrow(NoSignerError);
  });
});

describe("encrypting to self", () => {
  it("round-trips through the account's own signer", async () => {
    const account = signableAccount();

    const ciphertext = await encryptToSelf(account, "the ignored list");

    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain("the ignored list");
    await expect(decryptFromSelf(account, ciphertext!)).resolves.toBe("the ignored list");
  });

  it("reports null rather than throwing when the signer can't", async () => {
    const account = signableAccount();

    await expect(decryptFromSelf(account, "not ciphertext")).resolves.toBeNull();
  });
});

describe("whether an account can sign silently", () => {
  it("says yes for a signer that never asks us anything", async () => {
    await expect(canSignSilently(signableAccount())).resolves.toBe(true);
  });

  it("says yes for a Locked local key whose Unlock cache still opens", async () => {
    const { account, requestPassword } = await lockedLocalAccount();

    await expect(canSignSilently(account)).resolves.toBe(true);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("says no once the Unlock cache is gone and only the password would do", async () => {
    const { account, unlockCache, requestPassword } = await lockedLocalAccount();
    unlockCache.wipe();

    await expect(canSignSilently(account)).resolves.toBe(false);
    expect(requestPassword).not.toHaveBeenCalled();
  });
});
