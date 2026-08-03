// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  decrypt as decryptSecretKeyNip49,
  encrypt as encryptSecretKeyNip49,
} from "nostr-tools/nip49";
import { decode } from "nostr-tools/nip19";

import { LocalAccount } from "./local-account";
import { LocalSigner, UnlockCancelled } from "./local-signer";
import type { BrainstormAccount } from "./metadata";
import {
  canBackUp,
  heldBackup,
  keyAccessMessage,
  keyReachableWithoutPassword,
  mintBackup,
  NoLocalKeyError,
  revealSecretKey,
  setRecoveryPassword,
  verifyRecoveryPassword,
} from "./backup";
import { createFakeUnlockCache, fakePrompt, LOW_LOGN, PASSWORD } from "./test-fakes";

const NEW_PASSWORD = "a second recovery password";

/** A Locked local Account with both at-rest forms, as a reload leaves one. */
async function lockedAccount(requestPassword = fakePrompt()) {
  const unlockCache = createFakeUnlockCache();
  const secretKey = generateSecretKey();
  const account = await LocalAccount.fromKey(secretKey, {
    password: PASSWORD,
    logn: LOW_LOGN,
    unlockCache,
    requestPassword,
  });
  account.signer.lock();
  return { account, secretKey, unlockCache, requestPassword };
}

/** An Account whose key lives elsewhere — an extension or a bunker. */
function foreignAccount(): BrainstormAccount {
  const secretKey = generateSecretKey();
  class ExternalAccount extends BaseAccount<PrivateKeySigner, never, any> {
    static readonly type = "test-external";
  }
  return new ExternalAccount(
    getPublicKey(secretKey),
    new PrivateKeySigner(secretKey),
  ) as unknown as BrainstormAccount;
}

describe("minting a Backup", () => {
  it("encrypts the account's own key under the given password", async () => {
    const { account, secretKey } = await lockedAccount();

    const ncryptsec = await mintBackup(NEW_PASSWORD, { account, logn: LOW_LOGN });

    expect(ncryptsec.startsWith("ncryptsec")).toBe(true);
    expect(decryptSecretKeyNip49(ncryptsec, NEW_PASSWORD)).toEqual(secretKey);
  });

  // The cold-boot race: v1 read the key synchronously, so a backup triggered
  // before the key had been decrypted saw nothing and threw "no key available".
  it("waits for a Locked account to unlock rather than finding no key", async () => {
    const { account, requestPassword } = await lockedAccount();
    expect(account.locked).toBe(true);

    await expect(mintBackup(NEW_PASSWORD, { account, logn: LOW_LOGN })).resolves.toBeTruthy();
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("asks for the Recovery password when the Unlock cache can't open it", async () => {
    const { account, unlockCache, requestPassword } = await lockedAccount();
    unlockCache.wipe();

    await expect(mintBackup(NEW_PASSWORD, { account, logn: LOW_LOGN })).resolves.toBeTruthy();
    expect(requestPassword).toHaveBeenCalledTimes(1);
  });

  it("leaves the stored Backup alone — the file is a copy, not a re-mint", async () => {
    const { account } = await lockedAccount();
    const stored = account.signer.data.ncryptsec;

    await mintBackup(NEW_PASSWORD, { account, logn: LOW_LOGN });

    expect(account.signer.data.ncryptsec).toBe(stored);
  });

  it("refuses an account whose key isn't ours to reach", async () => {
    await expect(mintBackup(NEW_PASSWORD, { account: foreignAccount() })).rejects.toThrow(
      NoLocalKeyError,
    );
  });

  it("refuses when nobody is signed in", async () => {
    await expect(mintBackup(NEW_PASSWORD, { account: undefined })).rejects.toThrow(NoLocalKeyError);
  });
});

describe("revealing the secret key", () => {
  it("hands back the account's own key as an nsec", async () => {
    const { account, secretKey } = await lockedAccount();

    const nsec = await revealSecretKey({ account });

    const decoded = decode(nsec);
    expect(decoded.type).toBe("nsec");
    expect(decoded.data).toEqual(secretKey);
  });

  it("unlocks first, so a reveal straight after a page load works", async () => {
    const { account, requestPassword } = await lockedAccount();

    await expect(revealSecretKey({ account })).resolves.toContain("nsec1");
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("refuses an account whose key isn't ours to reach", async () => {
    await expect(revealSecretKey({ account: foreignAccount() })).rejects.toThrow(NoLocalKeyError);
  });
});

describe("a Backup-only account", () => {
  it("mints from its Backup, and the unlock it needed populates the Unlock cache", async () => {
    const unlockCache = createFakeUnlockCache();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const account = new LocalAccount(
      pubkey,
      new LocalSigner(
        pubkey,
        { ncryptsec: encryptSecretKeyNip49(secretKey, PASSWORD, LOW_LOGN) },
        { unlockCache, requestPassword: fakePrompt() },
      ),
    );

    await expect(
      mintBackup(NEW_PASSWORD, { account, logn: LOW_LOGN }),
    ).resolves.toBeTruthy();
    expect(account.locked).toBe(false);
    expect(account.signer.data.envelope).toBeDefined();
  });
});

describe("checking the Recovery password", () => {
  it("accepts the password the Backup was minted under", async () => {
    const { account } = await lockedAccount();

    await expect(verifyRecoveryPassword(PASSWORD, { account })).resolves.toEqual({ ok: true });
  });

  // The rehearsal the onboarding step exists for: a typo made at signup surfaces
  // here, while the key is still unlocked and a new password can be set.
  it("rejects a typo, and checking one leaves the account exactly as it was", async () => {
    const { account } = await lockedAccount();
    const stored = account.signer.data.ncryptsec;

    await expect(verifyRecoveryPassword("hunter2hunter2", { account })).resolves.toEqual({
      ok: false,
      reason: "wrong-password",
    });
    expect(account.locked).toBe(true);
    expect(account.signer.data.ncryptsec).toBe(stored);
  });

  it("refuses an account whose key isn't ours to reach", async () => {
    await expect(verifyRecoveryPassword(PASSWORD, { account: foreignAccount() })).rejects.toThrow(
      NoLocalKeyError,
    );
  });
});

describe("setting a new Recovery password", () => {
  it("re-mints the stored Backup so the new password is the one that opens it", async () => {
    const { account, secretKey } = await lockedAccount();
    const stored = account.signer.data.ncryptsec;

    await setRecoveryPassword(NEW_PASSWORD, { account, logn: LOW_LOGN });

    const reminted = account.signer.data.ncryptsec!;
    expect(reminted).not.toBe(stored);
    expect(decryptSecretKeyNip49(reminted, NEW_PASSWORD)).toEqual(secretKey);
    await expect(verifyRecoveryPassword(NEW_PASSWORD, { account })).resolves.toEqual({ ok: true });
  });

  it("unlocks on the way through, so a forgotten password is fixable from a cold boot", async () => {
    const { account, requestPassword } = await lockedAccount();
    expect(account.locked).toBe(true);

    await setRecoveryPassword(NEW_PASSWORD, { account, logn: LOW_LOGN });

    expect(account.locked).toBe(false);
    expect(requestPassword).not.toHaveBeenCalled(); // the Unlock cache answered
  });

  it("refuses an account whose key isn't ours to reach", async () => {
    await expect(setRecoveryPassword(NEW_PASSWORD, { account: foreignAccount() })).rejects.toThrow(
      NoLocalKeyError,
    );
  });
});

describe("the Backup an account already holds", () => {
  it("hands back the stored ncryptsec without minting a second one", async () => {
    const { account } = await lockedAccount();

    expect(heldBackup({ account })).toBe(account.signer.data.ncryptsec);
  });

  it("is nothing when the account has never had a Recovery password", async () => {
    const unlockCache = createFakeUnlockCache();
    const account = await LocalAccount.fromKey(generateSecretKey(), { unlockCache });

    expect(heldBackup({ account })).toBeUndefined();
  });

  it("is nothing for an account whose key lives elsewhere, rather than a throw", () => {
    expect(heldBackup({ account: foreignAccount() })).toBeUndefined();
    expect(canBackUp({ account: foreignAccount() })).toBe(false);
  });

  it("knows a local account can be backed up", async () => {
    const { account } = await lockedAccount();

    expect(canBackUp({ account })).toBe(true);
  });
});

describe("whether a forgotten password can still be replaced", () => {
  it("can, while the key is unlocked in memory — the moment right after signup", async () => {
    const unlockCache = createFakeUnlockCache();
    unlockCache.supported = false; // no cache to fall back on
    const account = await LocalAccount.fromKey(generateSecretKey(), {
      password: PASSWORD,
      logn: LOW_LOGN,
      unlockCache,
    });

    await expect(keyReachableWithoutPassword({ account })).resolves.toBe(true);
  });

  it("can, when the Unlock cache still opens it after a reload", async () => {
    const { account } = await lockedAccount();

    await expect(keyReachableWithoutPassword({ account })).resolves.toBe(true);
  });

  // Locked, with only the Backup left: asking for a new password would mean
  // asking for the old one first, which is the one they just said they'd lost.
  it("cannot, once only the Recovery password would open it", async () => {
    const { account, unlockCache } = await lockedAccount();
    unlockCache.wipe();

    await expect(keyReachableWithoutPassword({ account })).resolves.toBe(false);
  });

  it("cannot for an account whose key lives elsewhere", async () => {
    await expect(keyReachableWithoutPassword({ account: foreignAccount() })).resolves.toBe(false);
  });
});

describe("why reaching the key failed", () => {
  it("has nothing to say about a deliberate cancel", () => {
    expect(keyAccessMessage(new UnlockCancelled())).toBeNull();
  });

  it("still explains an account whose key lives elsewhere, and anything else", () => {
    expect(keyAccessMessage(new NoLocalKeyError())).toMatch(/isn't stored here/);
    expect(keyAccessMessage(new Error("who knows"))).toBe("Please try again.");
  });
});
