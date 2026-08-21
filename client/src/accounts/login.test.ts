// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionAccount } from "applesauce-accounts/accounts";
import { ExtensionSigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { accountManager } from "@/accounts";
import { LocalAccount } from "./local-account";
import { getMetadata, type BrainstormAccount } from "./metadata";
import {
  activateAccount,
  adoptAccount,
  extensionAccount,
  forgetAccount,
  localAccount,
  signOutActiveAccount,
  waitForExtension,
} from "./login";
import { createFakeUnlockCache, LOW_LOGN, PASSWORD } from "./test-fakes";

/** A NIP-07 extension, injected whenever the test says so. */
function injectExtension(pubkey: string): void {
  (globalThis as any).window = { nostr: { getPublicKey: async () => pubkey } };
}

afterEach(() => {
  delete (globalThis as any).window;
  for (const account of [...accountManager.accounts]) accountManager.removeAccount(account);
});

describe("waiting for the extension", () => {
  it("answers at once when one is already there", async () => {
    injectExtension("a".repeat(64));

    await expect(waitForExtension(1000, 50)).resolves.toBe(true);
  });

  it("gives up after the wait when none appears", async () => {
    await expect(waitForExtension(20, 5)).resolves.toBe(false);
  });

  it("catches one that injects late", async () => {
    setTimeout(() => injectExtension("b".repeat(64)), 15);

    await expect(waitForExtension(500, 5)).resolves.toBe(true);
  });
});

describe("the extension account", () => {
  it("comes from the library's constructor, holding the extension's pubkey", async () => {
    const pubkey = getPublicKey(generateSecretKey());
    injectExtension(pubkey);

    const account = await extensionAccount();

    expect(account.pubkey).toBe(pubkey);
    expect(account.type).toBe("extension");
  });

  it("throws when the extension never appears", async () => {
    await expect(extensionAccount()).rejects.toThrow();
  });
});

describe("an account over a pasted key", () => {
  it("carries the Unlock cache that lets it sign again after a reload", async () => {
    const unlockCache = createFakeUnlockCache();

    const account = await localAccount(generateSecretKey(), { unlockCache });

    expect(account.persistable).toBe(true);
  });

  it("is still handed back where nothing can store it — this tab or nothing", async () => {
    const unlockCache = createFakeUnlockCache();
    unlockCache.supported = false;

    const account = await localAccount(generateSecretKey(), { unlockCache });

    expect(account.persistable).toBe(false);
    expect(account.locked).toBe(false);
  });

  it("mints a Backup when a recovery password is given", async () => {
    const account = await localAccount(generateSecretKey(), {
      unlockCache: createFakeUnlockCache(),
      password: PASSWORD,
      logn: LOW_LOGN,
    });

    expect(account.signer.data.ncryptsec).toBeTruthy();
  });
});

describe("adopting and releasing", () => {
  async function adopted() {
    const account = await localAccount(generateSecretKey(), {
      unlockCache: createFakeUnlockCache(),
    });
    adoptAccount(account, { remembered: true, npub: "npub1test" });
    return account;
  }

  it("makes the adopted account the one that signs", async () => {
    const account = await adopted();

    expect(accountManager.active).toBe(account);
    expect(getMetadata(account).remembered).toBe(true);
    expect(getMetadata(account).npub).toBe("npub1test");
  });

  /**
   * `backedUp: true` carries across, so the nag never comes back — which makes it
   * a promise. The Backup it refers to lives in the *signer*, not the metadata,
   * so replacing the row with one that has only a device envelope quietly turns
   * that promise into a lie: clear site data or lose the vault and the account is
   * gone, while its owner still holds a file and the password that opens it.
   *
   * The normal path there is mundane — re-pasting an nsec where the vault works,
   * which mints no `ncryptsec` at all.
   */
  it("keeps the backup the replaced row was carrying", async () => {
    const key = generateSecretKey();
    const backedUp = await localAccount(key, {
      password: PASSWORD,
      logn: LOW_LOGN,
      unlockCache: createFakeUnlockCache(),
    });
    expect(backedUp.signer.data.ncryptsec).toBeTruthy();
    adoptAccount(backedUp, { remembered: true, backedUp: true });

    // as `loginWithPastedKey` builds it for a bare nsec: envelope only
    const pasted = await localAccount(key, { unlockCache: createFakeUnlockCache() });
    expect(pasted.signer.data.ncryptsec).toBeUndefined();

    adoptAccount(pasted, { remembered: true });

    expect(pasted.signer.data.ncryptsec).toBe(backedUp.signer.data.ncryptsec);
  });

  it("does not overwrite a backup the new row brought itself", async () => {
    const key = generateSecretKey();
    const old = await localAccount(key, {
      password: PASSWORD,
      logn: LOW_LOGN,
      unlockCache: createFakeUnlockCache(),
    });
    adoptAccount(old, { remembered: true, backedUp: true });

    const fresh = await localAccount(key, {
      password: "a-different-password",
      logn: LOW_LOGN,
      unlockCache: createFakeUnlockCache(),
    });
    const minted = fresh.signer.data.ncryptsec;

    adoptAccount(fresh, { remembered: true });

    expect(fresh.signer.data.ncryptsec).toBe(minted);
  });

  it("replaces the row this device already held for the same identity and signer", async () => {
    const key = generateSecretKey();
    const first = await localAccount(key, { unlockCache: createFakeUnlockCache() });
    adoptAccount(first, { remembered: true, createdInApp: true, backedUp: true });
    const again = await localAccount(key, { unlockCache: createFakeUnlockCache() });

    adoptAccount(again, { remembered: true });

    expect(accountManager.accounts).toEqual([again]);
    // what the replaced row knew about itself is not lost with it
    expect(getMetadata(again).createdInApp).toBe(true);
    expect(getMetadata(again).backedUp).toBe(true);
  });

  it("keeps a second signer for the same identity — that is a real pair of rows", async () => {
    const key = generateSecretKey();
    const held = await localAccount(key, { unlockCache: createFakeUnlockCache() });
    adoptAccount(held, { remembered: true });
    const extension = new ExtensionAccount(held.pubkey, new ExtensionSigner());

    adoptAccount(extension as unknown as LocalAccount, { remembered: true });

    expect(accountManager.accounts).toHaveLength(2);
  });

  it("keeps the session an account was authenticated with", async () => {
    const account = await localAccount(generateSecretKey(), {
      unlockCache: createFakeUnlockCache(),
    });
    account.metadata = { remembered: false, session: { token: "t", isAdmin: false } };

    adoptAccount(account, { remembered: true });

    expect(getMetadata(account).session?.token).toBe("t");
  });

  it("keeps the account listed and its key at rest on sign out — one tap to return", async () => {
    const account = await adopted();
    account.metadata = { ...getMetadata(account), session: { token: "t", isAdmin: false } };

    signOutActiveAccount();

    expect(accountManager.active).toBeUndefined();
    expect(accountManager.accounts).toContain(account);
    expect(getMetadata(account).session).toBeUndefined();
    expect(account.persistable).toBe(true);
    // the in-memory key goes; the Unlock cache is what brings it back
    expect(account.locked).toBe(true);
  });

  it("holds on to a key with nowhere to go — locking it would be losing it", async () => {
    const unlockCache = createFakeUnlockCache();
    unlockCache.supported = false;
    const account = await localAccount(generateSecretKey(), { unlockCache });
    adoptAccount(account, { remembered: true });

    signOutActiveAccount();

    expect(account.persistable).toBe(false);
    expect(account.locked).toBe(false);
  });

  it("is a no-op when nobody is signed in", () => {
    expect(() => signOutActiveAccount()).not.toThrow();
  });

  it("hands signing to an account this device already holds", async () => {
    const first = await adopted();
    const second = await adopted();

    activateAccount(first);

    expect(accountManager.active).toBe(first);
    expect(accountManager.accounts).toContain(second);
  });

  it("forgets a chosen account without touching the one that signs", async () => {
    const signedIn = await adopted();
    const other = await localAccount(generateSecretKey(), {
      unlockCache: createFakeUnlockCache(),
    });
    adoptAccount(other, { remembered: true });
    activateAccount(signedIn);

    forgetAccount(other);

    expect(accountManager.accounts).not.toContain(other);
    expect(other.locked).toBe(true);
    expect(accountManager.active).toBe(signedIn);
  });

  it("shuts a Signer down rather than only dropping the reference", () => {
    // A remote signer's relay subscription and Amber's visibilitychange listener
    // both outlive the Account otherwise, for an identity we no longer hold.
    const destroy = vi.fn();
    const logout = vi.fn().mockResolvedValue(undefined);
    const account = {
      id: "external-1",
      pubkey: "b".repeat(64),
      type: "nostr-connect",
      signer: { destroy, logout },
    } as unknown as BrainstormAccount;

    forgetAccount(account);

    expect(destroy).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });
});
