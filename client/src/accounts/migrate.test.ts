// @vitest-environment node
import { describe, expect, it } from "vitest";
import { bytesToHex } from "nostr-tools/utils";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
import { ExtensionAccount } from "applesauce-accounts/accounts";

import { AccountManager } from "applesauce-accounts";

import { LocalAccount } from "./local-account";
import type { AccountMetadata, BrainstormAccount } from "./metadata";
import { migrateV1, V1_KEYS } from "./migrate";
import { ACCOUNTS_KEY, createPersistence, type StorageSeam } from "./persist";
import { createFakeUnlockCache, createTestStorage, v1UserBlob } from "./test-fakes";

/** A JWT whose payload is exactly `claims`. Only the payload is ever read. */
function token(claims: Record<string, unknown>): string {
  const body = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `header.${body}.signature`;
}

function setup() {
  const storage: StorageSeam = createTestStorage();
  const unlockCache = createFakeUnlockCache();
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const migrate = (options: { retireV1Keys?: boolean } = {}) =>
    migrateV1({ storage, signerOptions: { unlockCache }, ...options });
  /**
   * What bootstrap does between `migrateV1` and `finish()`: hold the Account and
   * write the blobs. `finish()` reads them back before deleting anything, so a
   * test that skips this is describing a browser whose save failed — which is
   * exactly the case where nothing may be retired.
   */
  const held = (account: BrainstormAccount) => {
    const manager = new AccountManager<AccountMetadata>();
    manager.addAccount(account);
    manager.setActive(account);
    return createPersistence(manager, storage).start();
  };
  return { storage, unlockCache, secretKey, pubkey, migrate, held };
}

describe("migrateV1", () => {
  it("signs nobody in when there is nothing to migrate", () => {
    const { migrate } = setup();
    expect(migrate()).toBeNull();
  });

  it("reuses an existing encrypted key verbatim, leaving the device binding alone", async () => {
    const { storage, unlockCache, secretKey, pubkey, migrate } = setup();
    const envelope = await unlockCache.encrypt(secretKey, pubkey);
    storage.device.setItem(V1_KEYS.encryptedKey, envelope);
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    const migration = migrate();
    const account = migration!.account as LocalAccount;

    expect(account).toBeInstanceOf(LocalAccount);
    expect(account.pubkey).toBe(pubkey);
    // the same envelope, not a re-minted one — nobody is prompted
    expect(account.signer.data.envelope).toBe(envelope);
    expect(account.signer.data.ncryptsec).toBeUndefined();
    expect(account.metadata?.remembered).toBe(true);
    // and it still opens, silently
    await expect(account.unlockSilently()).resolves.toBe(true);
  });

  it("leaves an encrypted key alone when no cached user names its pubkey", async () => {
    const { storage, unlockCache, secretKey, pubkey, migrate } = setup();
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));

    // the envelope's AAD is the pubkey, so without it there is nothing to open
    expect(migrate()).toBeNull();
    expect(storage.device.getItem(V1_KEYS.encryptedKey)).not.toBeNull();
  });

  it("re-wraps a legacy plaintext key in the background and deletes the plaintext", async () => {
    const { storage, secretKey, pubkey, migrate, held } = setup();
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    const migration = migrate({ retireV1Keys: true })!;
    const account = migration.account as LocalAccount;
    held(account);

    // synchronously usable — the key is held in memory, not yet at rest
    expect(account.pubkey).toBe(pubkey);
    expect(account.locked).toBe(false);
    expect(account.metadata?.remembered).toBe(true);
    expect(account.signer.data.envelope).toBeUndefined();
    expect(storage.device.getItem(V1_KEYS.legacyPlaintextKey)).not.toBeNull();

    await migration.finish();

    expect(account.signer.data.envelope).toBeDefined();
    expect(storage.device.getItem(V1_KEYS.legacyPlaintextKey)).toBeNull();
  });

  it("keeps the plaintext when there is no Unlock cache to replace it with", async () => {
    const { storage, unlockCache, secretKey, migrate } = setup();
    unlockCache.supported = false;
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));

    const migration = migrate({ retireV1Keys: true })!;
    await migration.finish();

    // deleting it would have been the only copy of the key
    expect(storage.device.getItem(V1_KEYS.legacyPlaintextKey)).not.toBeNull();
  });

  it("migrates a session-only key without remembering it", async () => {
    const { storage, secretKey, pubkey, migrate, held } = setup();
    storage.tab.setItem(V1_KEYS.sessionKey, bytesToHex(secretKey));

    const migration = migrate({ retireV1Keys: true })!;
    expect(migration.account.pubkey).toBe(pubkey);
    expect(migration.account.metadata?.remembered).toBe(false);
    held(migration.account);

    await migration.finish();
    expect(storage.tab.getItem(V1_KEYS.sessionKey)).toBeNull();
  });

  it("migrates an extension user from the pubkey v1 already cached", () => {
    const { storage, pubkey, migrate } = setup();
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    const migration = migrate()!;
    expect(migration.account).toBeInstanceOf(ExtensionAccount);
    expect(migration.account.pubkey).toBe(pubkey);
    expect(migration.account.metadata?.remembered).toBe(true);
  });

  it("prefers the key v1 would have unlocked when more than one row survives", async () => {
    const { storage, unlockCache, migrate } = setup();
    const sessionSk = generateSecretKey();
    const persistSk = generateSecretKey();
    storage.tab.setItem(V1_KEYS.sessionKey, bytesToHex(sessionSk));
    storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(persistSk, getPublicKey(persistSk)));
    storage.device.setItem(V1_KEYS.user, v1UserBlob(getPublicKey(persistSk)));

    // v1's own unlock order checks the session key first
    expect(migrate()!.account.pubkey).toBe(getPublicKey(sessionSk));
  });

  it("ignores a key row that isn't a key", () => {
    const { storage, pubkey, migrate } = setup();
    storage.device.setItem(V1_KEYS.legacyPlaintextKey, "not-hex");
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    // falls through to the signer that lives outside this app, rather than throwing
    expect(migrate()!.account).toBeInstanceOf(ExtensionAccount);
  });

  it("is a no-op once v2 holds an account", () => {
    const { storage, pubkey, migrate } = setup();
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
    storage.device.setItem(ACCOUNTS_KEY, JSON.stringify([{ type: "extension", pubkey }]));

    expect(migrate()).toBeNull();
  });

  it("is a no-op when the account v2 holds is the per-tab one", () => {
    const { storage, pubkey, migrate } = setup();
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
    storage.tab.setItem(ACCOUNTS_KEY, JSON.stringify([{ type: "extension", pubkey }]));

    expect(migrate()).toBeNull();
  });

  it("is a no-op when the blob is unreadable, rather than migrating over it", () => {
    const { storage, pubkey, migrate } = setup();
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
    storage.device.setItem(ACCOUNTS_KEY, "{not json");

    // whatever it holds is an identity; persistence quarantines it
    expect(migrate()).toBeNull();
  });

  it("still migrates a v1 sign-in that happened after an anonymous visit", () => {
    const { storage, pubkey, migrate } = setup();
    // an anonymous visit writes empty blobs; the v1 login flow is still the only one
    storage.device.setItem(ACCOUNTS_KEY, "[]");
    storage.tab.setItem(ACCOUNTS_KEY, "[]");
    storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

    expect(migrate()!.account.pubkey).toBe(pubkey);
  });

  describe("folding v1's scattered state into metadata", () => {
    it("carries the session token and the admin claim it holds", () => {
      const { storage, pubkey, migrate } = setup();
      const jwt = token({ is_admin: true });
      storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
      storage.device.setItem(V1_KEYS.token, jwt);

      expect(migrate()!.account.metadata?.session).toEqual({ token: jwt, isAdmin: true });
    });

    it("carries the display cache and the npub", () => {
      const { storage, pubkey, migrate } = setup();
      storage.device.setItem(
        V1_KEYS.user,
        v1UserBlob(pubkey, { displayName: "Alice", picture: "https://example.test/a.png", nip05: "alice@example.test" }),
      );

      expect(migrate()!.account.metadata).toMatchObject({
        name: "Alice",
        picture: "https://example.test/a.png",
        nip05: "alice@example.test",
        npub: nip19.npubEncode(pubkey),
      });
    });

    it("carries the pubkey-namespaced flags", () => {
      const { storage, pubkey, migrate } = setup();
      storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
      storage.device.setItem(`brainstorm_backup_done:${pubkey}`, "true");
      storage.device.setItem(`brainstorm_created_inapp:${pubkey}`, "true");
      storage.device.setItem(`brainstorm_initial_setup_done:${pubkey}`, "true");
      storage.device.setItem(`brainstorm_nip85_activated:${pubkey}`, "true");
      storage.device.setItem(`brainstorm_active_pov:${pubkey}`, "mywot");

      expect(migrate()!.account.metadata).toMatchObject({
        backedUp: true,
        createdInApp: true,
        initialSetupDone: true,
        nip85Activated: true,
        perspective: "mywot",
      });
    });

    it("does not inherit another pubkey's flags or session", () => {
      const { storage, secretKey, pubkey, migrate } = setup();
      const stranger = getPublicKey(generateSecretKey());
      storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));
      storage.device.setItem(V1_KEYS.user, v1UserBlob(stranger, { displayName: "Someone else" }));
      storage.device.setItem(V1_KEYS.token, token({ is_admin: true }));
      storage.device.setItem(`brainstorm_backup_done:${stranger}`, "true");

      const metadata = migrate()!.account.metadata!;
      expect(metadata.session).toBeUndefined();
      expect(metadata.name).toBeUndefined();
      expect(metadata.backedUp).toBeUndefined();
      expect(metadata.npub).toBe(nip19.npubEncode(pubkey));
    });

    it("ignores a perspective that isn't one", () => {
      const { storage, pubkey, migrate } = setup();
      storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
      storage.device.setItem(`brainstorm_active_pov:${pubkey}`, "something-else");

      expect(migrate()!.account.metadata?.perspective).toBeUndefined();
    });

    it("survives a cached user that won't parse", () => {
      const { storage, secretKey, pubkey, migrate } = setup();
      storage.device.setItem(V1_KEYS.user, "{not json");
      storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));

      expect(migrate()!.account.pubkey).toBe(pubkey);
    });
  });

  describe("retiring the v1 keys", () => {
    it("leaves a row alone when the caller opts out", async () => {
      const { storage, unlockCache, secretKey, pubkey, migrate } = setup();
      storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
      storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
      storage.device.setItem(V1_KEYS.token, token({}));
      storage.device.setItem(`brainstorm_backup_done:${pubkey}`, "true");

      await migrate({ retireV1Keys: false })!.finish();

      expect(storage.device.getItem(V1_KEYS.user)).not.toBeNull();
      expect(storage.device.getItem(V1_KEYS.token)).not.toBeNull();
      expect(storage.device.getItem(V1_KEYS.encryptedKey)).not.toBeNull();
      expect(storage.device.getItem(`brainstorm_backup_done:${pubkey}`)).not.toBeNull();
    });

    it("removes what v2 now holds", async () => {
      const { storage, unlockCache, secretKey, pubkey, migrate, held } = setup();
      storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
      storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));
      storage.device.setItem(V1_KEYS.token, token({}));
      storage.device.setItem(`brainstorm_backup_done:${pubkey}`, "true");
      storage.device.setItem(`brainstorm_active_pov:${pubkey}`, "mywot");

      const migration = migrate()!;
      held(migration.account);
      await migration.finish();

      expect(storage.device.getItem(V1_KEYS.user)).toBeNull();
      expect(storage.device.getItem(V1_KEYS.token)).toBeNull();
      expect(storage.device.getItem(V1_KEYS.encryptedKey)).toBeNull();
      expect(storage.device.getItem(`brainstorm_backup_done:${pubkey}`)).toBeNull();
      expect(storage.device.getItem(`brainstorm_active_pov:${pubkey}`)).toBeNull();
    });

    it("retires nothing when the v2 blob never took the account", async () => {
      const { storage, unlockCache, secretKey, pubkey, migrate } = setup();
      storage.device.setItem(V1_KEYS.encryptedKey, await unlockCache.encrypt(secretKey, pubkey));
      storage.device.setItem(V1_KEYS.user, v1UserBlob(pubkey));

      // no `held` — a browser whose save was blocked or over quota. `save()` only
      // logs, so this is indistinguishable from success without reading back.
      await migrate()!.finish();

      // the envelope is the only copy of this key; deleting it would be permanent
      expect(storage.device.getItem(V1_KEYS.encryptedKey)).not.toBeNull();
      expect(storage.device.getItem(V1_KEYS.user)).not.toBeNull();
    });

    it("keeps the plaintext when the at-rest form it re-wrapped never reached the blob", async () => {
      const { storage, secretKey, migrate } = setup();
      storage.device.setItem(V1_KEYS.legacyPlaintextKey, bytesToHex(secretKey));

      await migrate()!.finish();

      expect(storage.device.getItem(V1_KEYS.legacyPlaintextKey)).not.toBeNull();
    });

    it("keeps the cached user when it names an identity v2 did not take", async () => {
      const { storage, unlockCache, secretKey, pubkey, migrate, held } = setup();
      const stranger = generateSecretKey();
      // v1's unlock order takes the session key, leaving the envelope behind —
      // and `nostr_user` is the only thing that names its AAD
      storage.tab.setItem(V1_KEYS.sessionKey, bytesToHex(secretKey));
      storage.device.setItem(
        V1_KEYS.encryptedKey,
        await unlockCache.encrypt(stranger, getPublicKey(stranger)),
      );
      storage.device.setItem(V1_KEYS.user, v1UserBlob(getPublicKey(stranger)));
      storage.device.setItem(V1_KEYS.token, token({}));

      const migration = migrate()!;
      expect(migration.account.pubkey).toBe(pubkey);
      held(migration.account);
      await migration.finish();

      expect(storage.device.getItem(V1_KEYS.encryptedKey)).not.toBeNull();
      expect(storage.device.getItem(V1_KEYS.user)).not.toBeNull();
      expect(storage.device.getItem(V1_KEYS.token)).not.toBeNull();
      // what did go is the row v2 replaced
      expect(storage.tab.getItem(V1_KEYS.sessionKey)).toBeNull();
    });
  });
});
