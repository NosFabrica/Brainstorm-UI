// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { LocalSigner, NoUnlockPathError, setRecoveryPasswordPrompt } from "./local-signer";
import { keyFixture, LOW_LOGN, PASSWORD } from "./test-fakes";

afterEach(() => setRecoveryPasswordPrompt(undefined));

describe("LocalSigner unlock paths", () => {
  it("unlocks silently from the Unlock cache when both forms are present", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(
      pubkey,
      { ncryptsec, envelope },
      { unlockCache, requestPassword },
    );

    expect(signer.unlocked).toBe(false);
    await signer.unlock();

    expect(signer.unlocked).toBe(true);
    expect(await signer.getPublicKey()).toBe(pubkey);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("unlocks silently from the Unlock cache alone (the migrated account)", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache, requestPassword });

    await signer.unlock();

    expect(signer.unlocked).toBe(true);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("prompts for the Recovery password when only the Backup is present", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await signer.unlock();

    expect(requestPassword).toHaveBeenCalledTimes(1);
    expect(await signer.getPublicKey()).toBe(pubkey);
  });

  it("falls back to the app-wide prompt when the Signer has none of its own", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const installed = vi.fn(async () => PASSWORD);
    setRecoveryPasswordPrompt(installed);
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    await signer.unlock();

    expect(installed).toHaveBeenCalledTimes(1);
    expect(installed.mock.calls[0][0]).toBe(signer);
  });

  it("is terminal when nothing can ask for the Recovery password", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    await expect(signer.unlock()).rejects.toBeInstanceOf(NoUnlockPathError);
  });

  it("takes a password passed in rather than prompting", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await signer.unlock(PASSWORD);

    expect(requestPassword).not.toHaveBeenCalled();
    expect(signer.unlocked).toBe(true);
  });

  it("throws on the wrong Recovery password and stays locked", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    await expect(signer.unlock("wrong")).rejects.toThrow();
    expect(signer.unlocked).toBe(false);
    // and a later attempt with the right password still works
    await signer.unlock(PASSWORD);
    expect(signer.unlocked).toBe(true);
  });

  it("has no unlock path with neither form", async () => {
    const { pubkey, unlockCache } = await keyFixture();
    const signer = new LocalSigner(pubkey, {}, { unlockCache });

    await expect(signer.unlock()).rejects.toBeInstanceOf(NoUnlockPathError);
  });

  it("ignores the Unlock cache where there isn't one", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    unlockCache.supported = false;
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(
      pubkey,
      { ncryptsec, envelope },
      { unlockCache, requestPassword },
    );

    await signer.unlock();

    expect(requestPassword).toHaveBeenCalledTimes(1);
    // the envelope is untouched — it may work again on a device that has the cache
    expect(signer.data.envelope).toBe(envelope);
  });
});

describe("LocalSigner stale Unlock cache", () => {
  it("discards a stale envelope and falls through to the Backup", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    unlockCache.wipe(); // the device key is gone; the envelope no longer decrypts
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(
      pubkey,
      { ncryptsec, envelope },
      { unlockCache, requestPassword },
    );

    await signer.unlock();

    expect(signer.unlocked).toBe(true);
    expect(requestPassword).toHaveBeenCalledTimes(1);
    expect(signer.data.envelope).toBeUndefined();
  });

  it("is terminal when a stale envelope is the only form", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    unlockCache.wipe();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache });

    await expect(signer.unlock()).rejects.toBeInstanceOf(NoUnlockPathError);
    expect(signer.unlocked).toBe(false);
  });

  it("fails closed on an envelope minted for another account", async () => {
    const { unlockCache, envelope } = await keyFixture();
    const stranger = getPublicKey(generateSecretKey());
    const signer = new LocalSigner(stranger, { envelope }, { unlockCache });

    await expect(signer.unlock()).rejects.toBeInstanceOf(NoUnlockPathError);
  });
});

describe("LocalSigner silent unlock", () => {
  it("opens the Unlock cache and reports success, never prompting", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache, requestPassword });

    expect(await signer.unlockSilently()).toBe(true);
    expect(signer.unlocked).toBe(true);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("reports failure rather than prompting when only the Backup is left", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache, requestPassword });
    unlockCache.wipe(); // the envelope is now stale

    expect(await signer.unlockSilently()).toBe(false);
    expect(signer.unlocked).toBe(false);
    expect(requestPassword).not.toHaveBeenCalled();
    expect(signer.data.envelope).toBeUndefined(); // and the stale cache is discarded
  });

  it("waits on an unlock already in flight instead of opening a second", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    const [, silent] = await Promise.all([signer.unlock(), signer.unlockSilently()]);

    expect(silent).toBe(true);
    expect(requestPassword).toHaveBeenCalledTimes(1);
  });
});

describe("LocalSigner concurrency", () => {
  it("shares one in-flight unlock, so two callers produce one password request", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD);
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await Promise.all([signer.unlock(), signer.unlock(), signer.unlock()]);

    expect(requestPassword).toHaveBeenCalledTimes(1);
  });

  it("lets a later caller retry after a shared unlock fails", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = vi.fn(async () => PASSWORD).mockResolvedValueOnce("wrong");
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await expect(Promise.all([signer.unlock(), signer.unlock()])).rejects.toThrow();
    await signer.unlock();

    expect(signer.unlocked).toBe(true);
    expect(requestPassword).toHaveBeenCalledTimes(2);
  });
});

describe("LocalSigner cache and Backup", () => {
  it("writes the Unlock cache after a Backup unlock, and says so", async () => {
    const { pubkey, secretKey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });
    const changes = vi.fn();
    signer.changed$.subscribe(changes);

    await signer.unlock(PASSWORD);
    await signer.cache();

    expect(signer.data.envelope).toBeDefined();
    expect(await unlockCache.decrypt(signer.data.envelope!, pubkey)).toEqual(secretKey);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it("leaves an existing cache alone and never throws when there isn't one", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache });
    await signer.unlock();
    await signer.cache();
    expect(signer.data.envelope).toBe(envelope);

    unlockCache.supported = false;
    const other = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });
    await other.unlock(PASSWORD);
    await other.cache();
    expect(other.data.envelope).toBeUndefined();
  });

  it("mints a Backup from an unlocked key, and refuses while locked", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache });

    await expect(signer.setRecoveryPassword("hunter2", LOW_LOGN)).rejects.toThrow();

    await signer.unlock();
    await signer.setRecoveryPassword("hunter2", LOW_LOGN);

    expect(signer.data.ncryptsec).toMatch(/^ncryptsec1/);
    const restored = new LocalSigner(pubkey, { ncryptsec: signer.data.ncryptsec }, { unlockCache });
    await restored.unlock("hunter2");
    expect(restored.unlocked).toBe(true);
  });

  it("locks by dropping the in-memory key", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache });

    await signer.unlock();
    signer.lock();

    expect(signer.unlocked).toBe(false);
  });

  it("signs and encrypts once unlocked", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache });

    const event = await signer.signEvent({ kind: 1, content: "hi", tags: [], created_at: 0 });
    expect(event.pubkey).toBe(pubkey);

    const cipher = await signer.nip44.encrypt(pubkey, "secret");
    expect(await signer.nip44.decrypt(pubkey, cipher)).toBe("secret");
  });
});
