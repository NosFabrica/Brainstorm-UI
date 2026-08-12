// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { nsecEncode } from "nostr-tools/nip19";
import { bytesToHex } from "nostr-tools/utils";

import { createManager } from "./manager";
import { LocalAccount } from "./local-account";
import { updateMetadata } from "./metadata";
import { ACCOUNTS_KEY, ACTIVE_KEY, BACKUP_KEY, QUARANTINE_KEY, type StorageSeam } from "./persist";
import {
  createFakeUnlockCache,
  createTestStorage,
  type FakeUnlockCache,
  LOW_LOGN,
  PASSWORD,
} from "./test-fakes";

function read(store: StorageSeam["device"], key: string): any {
  const raw = store.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

async function addAccount(
  manager: ReturnType<typeof createManager>["manager"],
  unlockCache: FakeUnlockCache,
  opts: { remembered: boolean; password?: string },
) {
  const secretKey = generateSecretKey();
  const account = await LocalAccount.fromKey(secretKey, {
    password: opts.password,
    logn: LOW_LOGN,
    unlockCache,
  });
  account.metadata = { remembered: opts.remembered };
  manager.addAccount(account);
  manager.setActive(account);
  return { secretKey, account };
}

describe("account persistence", () => {
  it("writes Remembered Accounts to localStorage and the rest to sessionStorage", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager } = createManager({ storage, unlockCache });

    const { account: kept } = await addAccount(manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });
    const { account: tab } = await addAccount(manager, unlockCache, { remembered: false });

    expect(read(storage.device, ACCOUNTS_KEY).map((e: any) => e.id)).toEqual([kept.id]);
    expect(read(storage.tab, ACCOUNTS_KEY).map((e: any) => e.id)).toEqual([tab.id]);
  });

  it("restores accounts, metadata and the Active Account on the next load", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const first = createManager({ storage, unlockCache });
    const { account } = await addAccount(first.manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });
    updateMetadata(account, { name: "Lira", session: { token: "jwt", isAdmin: true } });
    first.stop();

    const { manager } = createManager({ storage, unlockCache });

    expect(manager.accounts).toHaveLength(1);
    expect(manager.accounts[0].id).toBe(account.id);
    expect(manager.accounts[0].metadata).toEqual(account.metadata);
    expect(manager.active?.id).toBe(account.id);
    expect(storage.device.getItem(ACTIVE_KEY)).toBe(account.id);
  });

  it("saves on a metadata change, not only when accounts come and go", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager } = createManager({ storage, unlockCache });
    const { account } = await addAccount(manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });

    // a Session refresh writes metadata and never touches accounts$
    manager.setAccountMetadata(account.id, {
      ...account.metadata!,
      session: { token: "fresh", isAdmin: false },
    });

    expect(read(storage.device, ACCOUNTS_KEY)[0].metadata.session.token).toBe("fresh");
  });

  it("saves the Unlock cache the first unlock mints, so the next load is silent", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const first = createManager({ storage, unlockCache });
    // an Account restored on a new device: a Backup and nothing else
    const restored = await LocalAccount.fromKey(generateSecretKey(), {
      unlockCache,
      password: PASSWORD,
      logn: LOW_LOGN,
    });
    restored.signer.data.envelope = undefined;
    restored.signer.lock();
    restored.metadata = { remembered: true };
    first.manager.addAccount(restored);
    expect(read(storage.device, ACCOUNTS_KEY)[0].signer.envelope).toBeUndefined();

    await restored.unlock(PASSWORD);

    expect(read(storage.device, ACCOUNTS_KEY)[0].signer.envelope).toBeDefined();

    // and the reloaded Account unlocks with no password at all
    first.stop();
    const { manager } = createManager({ storage, unlockCache });
    await (manager.accounts[0] as LocalAccount).unlock();
    expect((manager.accounts[0] as LocalAccount).locked).toBe(false);
  });

  it("saves the discarding of a stale Unlock cache", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager } = createManager({ storage, unlockCache });
    const { account } = await addAccount(manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });
    const stale = read(storage.device, ACCOUNTS_KEY)[0].signer.envelope;
    account.signer.lock();
    unlockCache.wipe(); // the device key is gone, so `stale` decrypts nothing

    await account.unlock(PASSWORD);

    // the envelope that no longer decrypts left storage, not just memory
    const stored = read(storage.device, ACCOUNTS_KEY)[0].signer;
    expect(stored.envelope).not.toBe(stale);
    expect(await unlockCache.decrypt(stored.envelope, account.pubkey)).toBeInstanceOf(Uint8Array);
    expect(stored.ncryptsec).toMatch(/^ncryptsec1/);
  });

  it("forgets an Account that is removed", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager } = createManager({ storage, unlockCache });
    const { account } = await addAccount(manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });

    manager.removeAccount(account);

    expect(read(storage.device, ACCOUNTS_KEY)).toEqual([]);
    expect(storage.device.getItem(ACTIVE_KEY)).toBe(null);
  });
});

describe("adopting one Account, for a tab that started before it existed", () => {
  it("restores just that entry, leaving what this tab already holds alone", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const writer = createManager({ storage, unlockCache });
    const { account: held } = await addAccount(writer.manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });

    // a second tab, started when only `held` existed
    const reader = createManager({ storage, unlockCache });
    const { account: added } = await addAccount(writer.manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });

    const adopted = reader.persistence.adopt(added.id);

    expect(adopted?.id).toBe(added.id);
    expect(reader.manager.accounts.map((a) => a.id).sort()).toEqual([held.id, added.id].sort());
  });

  it("hands back the one it already holds rather than a second copy", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager, persistence } = createManager({ storage, unlockCache });
    const { account } = await addAccount(manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });

    expect(persistence.adopt(account.id)).toBe(account);
    expect(manager.accounts).toHaveLength(1);
  });

  it("has nothing to offer for an id the blob never held", () => {
    const storage = createTestStorage();
    const { persistence } = createManager({ storage, unlockCache: createFakeUnlockCache() });

    expect(persistence.adopt("not-in-the-blob")).toBeNull();
  });
});

describe("the plaintext fence — this test must never be deleted", () => {
  it("never writes a raw key, in either storage, in any Signer state", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager } = createManager({ storage, unlockCache });

    const { secretKey: keptKey } = await addAccount(manager, unlockCache, {
      remembered: true,
      password: PASSWORD,
    });
    const { secretKey: tabKey } = await addAccount(manager, unlockCache, { remembered: false });

    const blobs = [storage.device.getItem(ACCOUNTS_KEY)!, storage.tab.getItem(ACCOUNTS_KEY)!];
    for (const blob of blobs) {
      for (const key of [keptKey, tabKey]) {
        expect(blob).not.toContain(bytesToHex(key));
        expect(blob).not.toContain(nsecEncode(key));
      }
      for (const entry of JSON.parse(blob)) {
        expect(entry.type).not.toBe("nsec");
        expect(entry.signer).not.toHaveProperty("key");
        // the only two things a stored Signer may carry, both encrypted
        for (const field of Object.keys(entry.signer)) {
          expect(["ncryptsec", "envelope"]).toContain(field);
        }
      }
    }

    // a non-Remembered login is still encrypted, in sessionStorage
    expect(JSON.parse(blobs[1])[0].signer.envelope).toBeDefined();
  });

  it("does not register the plaintext account type", () => {
    const { manager } = createManager({
      storage: createTestStorage(),
      unlockCache: createFakeUnlockCache(),
    });

    expect(manager.types.has("nsec")).toBe(false);
    expect([...manager.types.keys()]).not.toContain("nsec");
  });
});

describe("a blob that will not load", () => {
  const pubkey = getPublicKey(generateSecretKey());
  const badEntry = { id: "bad", type: "some-future-signer", pubkey, signer: { secret: "x" } };

  it("quarantines the entries it cannot load and keeps the ones it can", async () => {
    const unlockCache = createFakeUnlockCache();
    const good = await LocalAccount.fromKey(generateSecretKey(), { unlockCache, logn: LOW_LOGN });
    good.metadata = { remembered: true };
    const storage = createTestStorage();
    storage.device.setItem(ACCOUNTS_KEY, JSON.stringify([good.toJSON(), badEntry]));

    const { manager } = createManager({ storage, unlockCache });

    expect(manager.accounts.map((a) => a.id)).toEqual([good.id]);
    expect(read(storage.device, QUARANTINE_KEY)).toEqual([badEntry]);
  });

  it("quarantines a non-Remembered entry where it found it, not in localStorage", () => {
    const storage = createTestStorage();
    storage.tab.setItem(ACCOUNTS_KEY, JSON.stringify([badEntry]));

    createManager({ storage, unlockCache: createFakeUnlockCache() }).stop();

    expect(read(storage.tab, QUARANTINE_KEY)).toEqual([badEntry]);
    expect(storage.device.getItem(QUARANTINE_KEY)).toBe(null);
  });

  it("quarantines a blob that will not parse and still boots", () => {
    const storage = createTestStorage();
    storage.device.setItem(ACCOUNTS_KEY, "{not json");

    const { manager } = createManager({ storage, unlockCache: createFakeUnlockCache() });

    expect(manager.accounts).toEqual([]);
    expect(read(storage.device, QUARANTINE_KEY)).toEqual(["{not json"]);
  });

  it("keeps the original blob as a backup, written once, before the first save", async () => {
    const unlockCache = createFakeUnlockCache();
    const good = await LocalAccount.fromKey(generateSecretKey(), { unlockCache, logn: LOW_LOGN });
    good.metadata = { remembered: true };
    const original = JSON.stringify([good.toJSON(), badEntry]);
    const storage = createTestStorage();
    storage.device.setItem(ACCOUNTS_KEY, original);

    const { manager } = createManager({ storage, unlockCache });
    expect(storage.device.getItem(BACKUP_KEY)).toBe(original);

    // later saves leave the backup and the quarantine exactly as they were
    updateMetadata(manager.accounts[0], { name: "Lira" });
    manager.removeAccount(manager.accounts[0]);

    expect(storage.device.getItem(BACKUP_KEY)).toBe(original);
    expect(read(storage.device, QUARANTINE_KEY)).toEqual([badEntry]);
    expect(read(storage.device, ACCOUNTS_KEY)).toEqual([]);
  });

  it("does not re-quarantine the same entry on every load", () => {
    const unlockCache = createFakeUnlockCache();
    const storage = createTestStorage();

    storage.device.setItem(ACCOUNTS_KEY, JSON.stringify([badEntry]));
    createManager({ storage, unlockCache }).stop();
    storage.device.setItem(ACCOUNTS_KEY, JSON.stringify([badEntry]));
    createManager({ storage, unlockCache }).stop();

    expect(read(storage.device, QUARANTINE_KEY)).toHaveLength(1);
  });
});

/**
 * `save()` rewrites the whole blob, so skipping an Account does not decline to
 * add it — it *removes* one already there. `storedEntryFor`'s own doc comment
 * states the rule: "Anything that deletes the last copy of a key has to look
 * here first." This was the one deleter that didn't.
 */
describe("an account that loses its last at-rest form", () => {
  it("keeps the row it already had in storage", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    const { manager } = createManager({ storage, unlockCache });
    const { account } = await addAccount(manager, unlockCache, { remembered: true });
    expect(read(storage.device, ACCOUNTS_KEY)).toHaveLength(1);

    // whatever the reason — a stale cache, a browser that lost its device key —
    // the row already on disk is the only copy left
    account.signer.data.envelope = undefined;
    updateMetadata(account as never, { name: "forces a save" });

    expect(read(storage.device, ACCOUNTS_KEY)).toHaveLength(1);
  });

  it("still declines to write one that was never stored", async () => {
    const storage = createTestStorage();
    const unlockCache = createFakeUnlockCache();
    unlockCache.supported = false;
    const { manager } = createManager({ storage, unlockCache });

    // as a no-vault paste builds it: no envelope, no Backup, this tab only
    const account = await LocalAccount.fromKey(generateSecretKey(), {
      unlockCache,
      requirePersistable: false,
    });
    account.metadata = { remembered: true };
    manager.addAccount(account);

    // a row nothing can ever open is worse than none: it also tells migration
    // this browser is already v2's
    expect(read(storage.device, ACCOUNTS_KEY)).toEqual([]);
  });
});
