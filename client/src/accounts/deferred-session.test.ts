// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AccountManager, BaseAccount } from "applesauce-accounts";
import { PrivateKeySigner } from "applesauce-signers";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { deferredSession$, sessionDeferred } from "./deferred-session";
import { LocalAccount } from "./local-account";
import { updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";
import { createFakeUnlockCache, fakePrompt, LOW_LOGN, PASSWORD } from "./test-fakes";

/** An Account that signs without asking us for anything — an extension or a bunker. */
class AlwaysSignableAccount extends BaseAccount<PrivateKeySigner, never, AccountMetadata> {
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

/**
 * A Locked local Account. Without an Unlock cache — private browsing, or a
 * self-hosted instance over plain HTTP — only the Recovery password opens it.
 */
async function lockedAccount({ cached = true, requestPassword = fakePrompt() } = {}) {
  const unlockCache = createFakeUnlockCache();
  unlockCache.supported = cached;
  const account = await LocalAccount.fromKey(generateSecretKey(), {
    password: PASSWORD,
    logn: LOW_LOGN,
    unlockCache,
    requestPassword,
  });
  account.signer.lock();
  return account as unknown as BrainstormAccount;
}

/** A manager with `account` signed in — the only arrangement these tests need. */
function signedInAs(account: BrainstormAccount): AccountManager<AccountMetadata> {
  const manager = new AccountManager<AccountMetadata>();
  manager.addAccount(account as any);
  manager.setActive(account as any);
  return manager;
}

function withSession(account: BrainstormAccount): BrainstormAccount {
  updateMetadata(account, { session: { token: "a-token", isAdmin: false } });
  return account;
}

/** Collect what the stream says, letting the (async) unlock checks settle. */
function collect(manager: AccountManager<AccountMetadata>) {
  const seen: (BrainstormAccount | null)[] = [];
  const subscription = deferredSession$(manager).subscribe((account) => seen.push(account));
  return {
    seen,
    async settle() {
      for (let i = 0; i < 5; i++) await Promise.resolve();
      return seen;
    },
    stop: () => subscription.unsubscribe(),
  };
}

describe("whether a session is deferred", () => {
  it("is not, while the account holds one", async () => {
    expect(await sessionDeferred(withSession(await lockedAccount({ cached: false })))).toBe(false);
  });

  it("is not, when the key opens from the unlock cache — nobody has to be asked", async () => {
    expect(await sessionDeferred(await lockedAccount())).toBe(false);
  });

  it("is, when only the recovery password would mint one", async () => {
    expect(await sessionDeferred(await lockedAccount({ cached: false }))).toBe(true);
  });

  it("is not, for a signer that signs on its own — the next 401 re-auths inline", async () => {
    expect(await sessionDeferred(signableAccount())).toBe(false);
  });
});

describe("the deferred session stream", () => {
  it("says nobody while signed out", async () => {
    const manager = new AccountManager<AccountMetadata>();
    const stream = collect(manager);

    expect(await stream.settle()).toEqual([null]);
    stream.stop();
  });

  it("names the active account while its session is deferred", async () => {
    const account = await lockedAccount({ cached: false });

    const stream = collect(signedInAs(account));

    expect(await stream.settle()).toEqual([account]);
    stream.stop();
  });

  it("clears as soon as a session arrives, so the card and the admin nav agree", async () => {
    const account = await lockedAccount({ cached: false });
    const stream = collect(signedInAs(account));
    await stream.settle();

    withSession(account);

    expect(await stream.settle()).toEqual([account, null]);
    stream.stop();
  });

  it("clears once anything the user published has unlocked the key", async () => {
    const account = await lockedAccount({ cached: false });
    const stream = collect(signedInAs(account));
    await stream.settle();

    // what a publish does: sign, which asks for the password and unlocks
    await account.signEvent({ kind: 1, tags: [], content: "hi", created_at: 0 });

    expect(await stream.settle()).toEqual([account, null]);
    stream.stop();
  });

  it("ignores metadata writes that change nothing about the session", async () => {
    const account = await lockedAccount({ cached: false });
    const stream = collect(signedInAs(account));
    await stream.settle();

    updateMetadata(account, { name: "Alice" });

    expect(await stream.settle()).toEqual([account]);
    stream.stop();
  });
});
