// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

import {
  LocalSigner,
  NoUnlockPathError,
  RecoveryPasswordError,
  setRecoveryPasswordPrompt,
  UnlockCancelled,
  isUnlockCancelled,
  unlockFailureOf,
  type RecoveryPasswordRequest,
} from "./local-signer";
import { fakePrompt, keyFixture, LOW_LOGN, PASSWORD } from "./test-fakes";

afterEach(() => setRecoveryPasswordPrompt(undefined));

describe("LocalSigner unlock paths", () => {
  it("unlocks silently from the Unlock cache when both forms are present", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const requestPassword = fakePrompt();
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
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache, requestPassword });

    await signer.unlock();

    expect(signer.unlocked).toBe(true);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("prompts for the Recovery password when only the Backup is present", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await signer.unlock();

    expect(requestPassword).toHaveBeenCalledTimes(1);
    expect(await signer.getPublicKey()).toBe(pubkey);
  });

  it("falls back to the app-wide prompt when the Signer has none of its own", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const installed = fakePrompt();
    setRecoveryPasswordPrompt(installed);
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    await signer.unlock();

    expect(installed).toHaveBeenCalledTimes(1);
    expect(installed.mock.calls[0][0].signer).toBe(signer);
  });

  it("is terminal when nothing can ask for the Recovery password", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    await expect(signer.unlock()).rejects.toBeInstanceOf(NoUnlockPathError);
  });

  it("takes a password passed in rather than prompting", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await signer.unlock(PASSWORD);

    expect(requestPassword).not.toHaveBeenCalled();
    expect(signer.unlocked).toBe(true);
  });

  it("throws on the wrong Recovery password and stays locked", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    await expect(signer.unlock("wrong")).rejects.toBeInstanceOf(RecoveryPasswordError);
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
    const requestPassword = fakePrompt();
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

describe("LocalSigner and the Recovery password prompt", () => {
  it("keeps asking until a password opens the Backup, then stays unlocked", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const attempts: boolean[] = [];
    const requestPassword = vi.fn(async ({ attempt }: RecoveryPasswordRequest) => {
      for (const password of ["nope", "still nope", PASSWORD]) {
        const result = await attempt(password);
        attempts.push(result.ok);
        if (result.ok) return;
      }
    });
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await signer.unlock();

    expect(attempts).toEqual([false, false, true]);
    expect(requestPassword).toHaveBeenCalledTimes(1); // one prompt, three tries
    // and the key is held for the rest of the page load: signing asks nothing
    await signer.signEvent({ kind: 1, content: "", tags: [], created_at: 0 });
    expect(requestPassword).toHaveBeenCalledTimes(1);
  });

  it("reports a wrong password as one, so the modal can offer a retry", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    let reason: string | undefined;
    const signer = new LocalSigner(
      pubkey,
      { ncryptsec },
      {
        unlockCache,
        requestPassword: async ({ attempt }) => {
          const result = await attempt("wrong");
          if (!result.ok) reason = result.reason;
          throw new UnlockCancelled();
        },
      },
    );

    await expect(signer.unlock()).rejects.toBeInstanceOf(UnlockCancelled);
    expect(reason).toBe("wrong-password");
  });

  // A Backup minted above @noble's memory ceiling throws from inside scrypt, and
  // telling someone their correct password is wrong is the worst failure here.
  it("never calls a memory failure a wrong password", () => {
    expect(unlockFailureOf(new Error("invalid tag"))).toBe("wrong-password");
    expect(
      unlockFailureOf(new Error('"maxmem" limit was hit, expected 128*r*(N+p) <= "maxmem"=1073742848')),
    ).toBe("unusable-backup");
  });

  it("propagates a cancel to the caller, untouched, and stays locked", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword: fakePrompt("wrong") });

    const error = await signer.unlock().catch((e) => e);

    expect(isUnlockCancelled(error)).toBe(true);
    expect(signer.unlocked).toBe(false);
  });

  it("is terminal when a prompt returns without unlocking", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword: async () => {} });

    await expect(signer.unlock()).rejects.toBeInstanceOf(NoUnlockPathError);
  });
});

describe("LocalSigner stale Unlock cache", () => {
  it("discards a stale envelope and falls through to the Backup", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    unlockCache.wipe(); // the device key is gone; the envelope no longer decrypts
    const requestPassword = fakePrompt();
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
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache, requestPassword });

    expect(await signer.unlockSilently()).toBe(true);
    expect(signer.unlocked).toBe(true);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("reports failure rather than prompting when only the Backup is left", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache, requestPassword });
    unlockCache.wipe(); // the envelope is now stale

    expect(await signer.unlockSilently()).toBe(false);
    expect(signer.unlocked).toBe(false);
    expect(requestPassword).not.toHaveBeenCalled();
    expect(signer.data.envelope).toBeUndefined(); // and the stale cache is discarded
  });

  it("waits on an unlock already in flight instead of opening a second", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    const [, silent] = await Promise.all([signer.unlock(), signer.unlockSilently()]);

    expect(silent).toBe(true);
    expect(requestPassword).toHaveBeenCalledTimes(1);
  });
});

describe("LocalSigner Unlock cache probe", () => {
  it("reports that the cache opens without keeping the key", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache });

    expect(await signer.probeUnlockCache()).toBe(true);
    expect(signer.unlocked).toBe(false);
  });

  it("reports a stale cache without discarding it — a probe is a question", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache });
    unlockCache.wipe();

    expect(await signer.probeUnlockCache()).toBe(false);
    expect(signer.data.envelope).toBe(envelope);
  });

  it("says no where there is no cache to open, and never prompts", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    expect(await signer.probeUnlockCache()).toBe(false);
    expect(requestPassword).not.toHaveBeenCalled();
  });

  it("says yes for a Signer that is already unlocked", async () => {
    const { secretKey, unlockCache } = await keyFixture();
    const signer = LocalSigner.fromKey(secretKey, { unlockCache });

    expect(await signer.probeUnlockCache()).toBe(true);
  });
});

describe("LocalSigner concurrency", () => {
  it("shares one in-flight unlock, so two callers produce one password request", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const requestPassword = fakePrompt();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await Promise.all([signer.unlock(), signer.unlock(), signer.unlock()]);

    expect(requestPassword).toHaveBeenCalledTimes(1);
  });

  it("lets a later caller retry after a shared unlock is cancelled", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    // gives up the first time it's asked, and answers the second
    const requestPassword = vi.fn(async ({ attempt }: RecoveryPasswordRequest) => {
      if (requestPassword.mock.calls.length === 1) throw new UnlockCancelled();
      await attempt(PASSWORD);
    });
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache, requestPassword });

    await expect(Promise.all([signer.unlock(), signer.unlock()])).rejects.toBeInstanceOf(
      UnlockCancelled,
    );
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

  it("checks a Recovery password against the Backup without unlocking", async () => {
    const { pubkey, unlockCache, ncryptsec } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec }, { unlockCache });

    expect(signer.verifyRecoveryPassword(PASSWORD)).toEqual({ ok: true });
    expect(signer.unlocked).toBe(false);
  });

  it("reports a wrong password as wrong, and leaves an unlocked key alone", async () => {
    const { pubkey, unlockCache, ncryptsec, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { ncryptsec, envelope }, { unlockCache });
    await signer.unlock();

    expect(signer.verifyRecoveryPassword("not the password")).toEqual({
      ok: false,
      reason: "wrong-password",
    });
    expect(signer.unlocked).toBe(true);
  });

  it("refuses to check a password when there is no Backup to check it against", async () => {
    const { pubkey, unlockCache, envelope } = await keyFixture();
    const signer = new LocalSigner(pubkey, { envelope }, { unlockCache });

    expect(() => signer.verifyRecoveryPassword(PASSWORD)).toThrow(NoUnlockPathError);
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
