// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { SignerMismatchError } from "applesauce-accounts";

import { LocalAccount } from "./local-account";
import { LocalSigner, NoUnlockPathError } from "./local-signer";
import { createFakeUnlockCache, keyFixture, LOW_LOGN, PASSWORD } from "./test-fakes";

describe("LocalAccount serialisation", () => {
  it("round-trips all four Signer states, keeping id and metadata", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const states = [{ ncryptsec, envelope }, { envelope }, { ncryptsec }, {}];

    for (const data of states) {
      const account = new LocalAccount(pubkey, new LocalSigner(pubkey, data, { unlockCache }));
      account.metadata = { remembered: true, name: "Lira", session: { token: "t", isAdmin: true } };

      const json = account.toJSON();
      const restored = LocalAccount.fromJSON(json, { unlockCache });

      expect(json.type).toBe("brainstorm-local");
      expect(json.signer).toEqual(data);
      expect(restored.id).toBe(account.id);
      expect(restored.pubkey).toBe(pubkey);
      expect(restored.metadata).toEqual(account.metadata);
      expect(restored.signer.data).toEqual(data);
    }
  });

  it("serialises a copy, so later cache writes do not mutate a written blob", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const account = new LocalAccount(pubkey, new LocalSigner(pubkey, { ncryptsec }, { unlockCache }));

    const json = account.toJSON();
    await account.signer.unlock(PASSWORD);
    await account.signer.cache();

    expect(json.signer.envelope).toBeUndefined();
    expect(account.toJSON().signer.envelope).toBeDefined();
  });

  it("reports Locked until its Signer holds the key", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = new LocalAccount(pubkey, new LocalSigner(pubkey, { envelope }, { unlockCache }));

    expect(account.locked).toBe(true);
    await account.unlock();
    expect(account.locked).toBe(false);
  });
});

describe("LocalAccount operations", () => {
  it("unlocks lazily on the first operation and caches the key", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const account = new LocalAccount(
      pubkey,
      new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword }),
    );

    const event = await account.signEvent({ kind: 1, content: "hi", tags: [], created_at: 0 });

    expect(event.pubkey).toBe(pubkey);
    expect(requestPassword).toHaveBeenCalledTimes(1);
    // the first unlock on a device populates the Unlock cache
    expect(account.signer.data.envelope).toBeDefined();
  });

  it("asks for the password once when two signs race", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const account = new LocalAccount(
      pubkey,
      new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword }),
    );

    await Promise.all([
      account.signEvent({ kind: 1, content: "one", tags: [], created_at: 0 }),
      account.signEvent({ kind: 1, content: "two", tags: [], created_at: 0 }),
    ]);

    expect(requestPassword).toHaveBeenCalledTimes(1);
  });

  it("throws rather than signing when there is no unlock path", async () => {
    const { pubkey, unlockCache } = await keyFixture();
    const account = new LocalAccount(pubkey, new LocalSigner(pubkey, {}, { unlockCache }));

    await expect(
      account.signEvent({ kind: 1, content: "hi", tags: [], created_at: 0 }),
    ).rejects.toBeInstanceOf(NoUnlockPathError);
  });

  it("rejects a Signer holding a different identity", async () => {
    const { unlockCache, envelope, pubkey } = await keyFixture();
    // the Signer unlocks a key for `pubkey` while the Account claims to be someone else
    const stranger = getPublicKey(generateSecretKey());
    const account = new LocalAccount(
      stranger,
      new LocalSigner(pubkey, { envelope }, { unlockCache }),
    );

    await expect(account.getPublicKey()).rejects.toBeInstanceOf(SignerMismatchError);
    await expect(
      account.signEvent({ kind: 1, content: "hi", tags: [], created_at: 0 }),
    ).rejects.toBeInstanceOf(SignerMismatchError);
  });

  it("encrypts and decrypts through the Account, unlocking on the way", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const account = new LocalAccount(pubkey, new LocalSigner(pubkey, { envelope }, { unlockCache }));

    const cipher = await account.nip44!.encrypt(pubkey, "secret");
    expect(await account.nip44!.decrypt(pubkey, cipher)).toBe("secret");
  });
});

describe("LocalAccount.fromKey", () => {
  it("mints both at-rest forms when given a Recovery password", async () => {
    const unlockCache = createFakeUnlockCache();
    const secretKey = generateSecretKey();

    const account = await LocalAccount.fromKey(secretKey, {
      password: PASSWORD,
      logn: LOW_LOGN,
      unlockCache,
    });

    expect(account.pubkey).toBe(getPublicKey(secretKey));
    expect(account.locked).toBe(false);
    expect(account.signer.data.ncryptsec).toMatch(/^ncryptsec1/);
    expect(account.signer.data.envelope).toBeDefined();
  });

  it("mints only the Unlock cache when no password is given (pasted nsec)", async () => {
    const unlockCache = createFakeUnlockCache();
    const account = await LocalAccount.fromKey(generateSecretKey(), { unlockCache });

    expect(account.signer.data.ncryptsec).toBeUndefined();
    expect(account.signer.data.envelope).toBeDefined();
  });

  it("refuses to hold a key it could never store or unlock again", async () => {
    const unlockCache = createFakeUnlockCache();
    unlockCache.supported = false; // private browsing: no cache, so a password is the only form

    await expect(
      LocalAccount.fromKey(generateSecretKey(), { unlockCache }),
    ).rejects.toBeInstanceOf(NoUnlockPathError);

    const account = await LocalAccount.fromKey(generateSecretKey(), {
      unlockCache,
      password: PASSWORD,
      logn: LOW_LOGN,
    });
    expect(account.signer.data.ncryptsec).toMatch(/^ncryptsec1/);
  });
});
