// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { ExtensionAccount } from "applesauce-accounts/accounts";

import { bootstrapAccounts, type BootstrapOptions } from "./bootstrap";
import { LocalAccount } from "./local-account";
import { V1_KEYS } from "./migrate";
import { ACCOUNTS_KEY, ACTIVE_KEY, type StorageSeam } from "./persist";
import { createFakeUnlockCache, createTestStorage, v1UserBlob, type FakeUnlockCache } from "./test-fakes";

/** Run the scheduled follow-up work now, so a test can await it. */
const inline = (task: () => void) => task();

function boot(storage: StorageSeam, unlockCache: FakeUnlockCache, options: BootstrapOptions = {}) {
  return bootstrapAccounts({ storage, unlockCache, schedule: inline, ...options });
}

function setup() {
  return { storage: createTestStorage(), unlockCache: createFakeUnlockCache() };
}

describe("bootstrapAccounts", () => {
  it("knows the identity synchronously — before anything is awaited", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    // no await between the call and the read: this is what the route guard does
    const { manager } = boot(storage, unlockCache);
    expect(manager.active?.pubkey).toBe(pubkey);
  });

  it("stays signed out when there is nothing to restore", () => {
    const { storage, unlockCache } = setup();
    const { manager } = boot(storage, unlockCache);

    expect(manager.accounts).toHaveLength(0);
    expect(manager.active).toBeUndefined();
  });

  it("writes the migrated identity to the v2 blob", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey, { displayName: "Alice" }));

    const { manager } = boot(storage, unlockCache);

    const blob = JSON.parse(storage.device.getItem(ACCOUNTS_KEY)!);
    expect(blob).toHaveLength(1);
    expect(blob[0].pubkey).toBe(pubkey);
    expect(blob[0].metadata).toMatchObject({ remembered: true, name: "Alice" });
    expect(storage.device.getItem(ACTIVE_KEY)).toBe(manager.active!.id);
  });

  it("keeps a signed-in user signed in across a reload", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    boot(storage, unlockCache).stop();
    // a second page load: migration is spent, the blob is the source of truth
    const { manager } = boot(storage, unlockCache);

    expect(manager.accounts).toHaveLength(1);
    expect(manager.active?.pubkey).toBe(pubkey);
    const account = manager.active as LocalAccount;
    await expect(account.unlockSilently()).resolves.toBe(true);
  });

  it("migrates a v1 sign-in that happened after an anonymous visit", () => {
    const { storage, unlockCache } = setup();
    const pubkey = getPublicKey(generateSecretKey());

    // an anonymous visit leaves empty blobs behind
    boot(storage, unlockCache).stop();
    expect(storage.device.getItem(ACCOUNTS_KEY)).toBe("[]");

    // and the v1 login flow is still the only one there is until it's rebuilt
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
    const { manager } = boot(storage, unlockCache);

    expect(manager.active?.pubkey).toBe(pubkey);
  });

  it("does not duplicate accounts when bootstrap runs twice", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    const first = boot(storage, unlockCache);
    await first.migrated;
    first.stop();

    for (let i = 0; i < 3; i++) {
      const again = boot(storage, unlockCache);
      expect(again.manager.accounts).toHaveLength(1);
      again.stop();
    }
  });

  it("does not duplicate accounts when the same manager restores twice", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    boot(storage, unlockCache).stop();
    const { manager, persistence } = boot(storage, unlockCache);

    // `fromJSON` doesn't clear despite its doc comment, so restoring is additive
    persistence.load();
    expect(manager.accounts).toHaveLength(1);
  });

  it("restores an extension account rather than quarantining it", () => {
    const { storage, unlockCache } = setup();
    const pubkey = getPublicKey(generateSecretKey());
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    boot(storage, unlockCache).stop();
    const { manager } = boot(storage, unlockCache);

    expect(manager.accounts).toHaveLength(1);
    expect(manager.active).toBeInstanceOf(ExtensionAccount);
    expect(manager.active?.pubkey).toBe(pubkey);
  });

  it("re-wraps a legacy plaintext key after first render, and the envelope reaches storage", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));

    const app = boot(storage, unlockCache);
    // nothing is written before the re-wrap: a row with no at-rest form could
    // never be opened again, and it would claim the browser for v2 regardless
    expect(JSON.parse(storage.device.getItem(ACCOUNTS_KEY)!)).toHaveLength(0);

    await app.migrated;

    const [entry] = JSON.parse(storage.device.getItem(ACCOUNTS_KEY)!);
    expect(entry.signer.envelope).toBeDefined();
    expect(entry.signer.key).toBeUndefined();
  });

  it("re-migrates rather than stranding a key it could not wrap", async () => {
    const { storage, unlockCache } = setup();
    unlockCache.supported = false;
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(generateSecretKey()));

    const app = boot(storage, unlockCache);
    await app.migrated;
    app.stop();

    // usable this session, but never written — on plain HTTP there is no Unlock
    // cache, and the plaintext row is still the only copy of the key
    expect(app.manager.active).toBeDefined();
    expect(JSON.parse(storage.device.getItem(ACCOUNTS_KEY)!)).toHaveLength(0);

    // so the next boot picks it up again instead of restoring an unopenable row
    expect(boot(storage, unlockCache).manager.accounts).toHaveLength(1);
  });

  it("defers the re-wrap rather than running it during bootstrap", async () => {
    const { storage, unlockCache } = setup();
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(generateSecretKey()));

    const tasks: Array<() => void> = [];
    const app = bootstrapAccounts({
      storage,
      unlockCache,
      schedule: (task) => void tasks.push(task),
    });

    expect(tasks).toHaveLength(1);
    expect((app.manager.active as LocalAccount).signer.data.envelope).toBeUndefined();

    tasks[0]!();
    await app.migrated;
    expect((app.manager.active as LocalAccount).signer.data.envelope).toBeDefined();
  });

  it("puts a session-only key in the per-tab blob, never on the device", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    storage.tab.setItem(V1_KEYS.sessionKey, bytesToHex(secretKey));

    const app = boot(storage, unlockCache);
    await app.migrated;

    expect(JSON.parse(storage.device.getItem(ACCOUNTS_KEY)!)).toHaveLength(0);
    const [entry] = JSON.parse(storage.tab.getItem(ACCOUNTS_KEY)!);
    expect(entry.pubkey).toBe(getPublicKey(secretKey));
    expect(entry.signer.envelope).toBeDefined();
    expect(entry.signer.key).toBeUndefined();
  });

  it("carries the v1 session token onto the account", async () => {
    const { storage, unlockCache } = setup();
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const token = `h.${btoa(JSON.stringify({ is_admin: true }))}.s`;
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
    storage.device.setItem(V1_KEYS.token, token);

    const { manager } = boot(storage, unlockCache);
    expect(manager.active?.metadata?.session).toEqual({ token, isAdmin: true });
  });

  it("still comes up when v1's storage is unreadable", () => {
    const { storage, unlockCache } = setup();
    const exploding = {
      ...storage.device,
      getItem(key: string) {
        if (key === V1_KEYS.user) throw new Error("storage is on fire");
        return storage.device.getItem(key);
      },
    };

    const { manager } = boot({ ...storage, device: exploding }, unlockCache);
    expect(manager.accounts).toHaveLength(0);
  });
});
