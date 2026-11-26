// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";

import { createManager } from "./manager";
import { LocalAccount } from "./local-account";
import type { BrainstormAccount } from "./metadata";
import { ACCOUNTS_KEY, BACKUP_KEY } from "./persist";
import { retireAccount } from "./retire";
import { createFakeUnlockCache, createTestStorage, fakePrompt, LOW_LOGN, PASSWORD } from "./test-fakes";

async function deviceWith(count: number) {
  const unlockCache = createFakeUnlockCache();
  const storage = createTestStorage();
  const rows: LocalAccount[] = [];
  for (let i = 0; i < count; i++) {
    const account = await LocalAccount.fromKey(generateSecretKey(), {
      unlockCache,
      logn: LOW_LOGN,
      password: PASSWORD,
      requestPassword: fakePrompt(PASSWORD),
    });
    account.metadata = { remembered: true };
    rows.push(account);
  }
  // As found at boot, so the backup holds every one of them.
  storage.device.setItem(ACCOUNTS_KEY, JSON.stringify(rows.map((row) => row.toJSON())));
  const managed = createManager({ storage, unlockCache });
  const forgetCaches = vi.fn(async () => {});
  const dropDeviceKey = vi.fn(async () => true);
  const retire = (account: BrainstormAccount) => retireAccount(account, { ...managed, forgetCaches, dropDeviceKey });
  const held = rows.map((row) => managed.manager.getAccount(row.id) as LocalAccount);
  return { storage, managed, held, retire, forgetCaches, dropDeviceKey };
}

describe("retiring an account", () => {
  it("takes it out of the manager, memory, the backup and its caches", async () => {
    const { storage, managed, held, retire, forgetCaches, dropDeviceKey } = await deviceWith(2);
    const [gone] = held;
    await gone.signEvent({ kind: 1, tags: [], content: "", created_at: 0 });

    retire(gone);

    expect(managed.manager.getAccount(gone.id)).toBeUndefined();
    expect(gone.signer.unlocked).toBe(false);
    expect(gone.signer.data).toEqual({});
    expect(storage.device.getItem(BACKUP_KEY)).not.toContain(gone.pubkey);
    expect(forgetCaches).toHaveBeenCalledWith(gone.pubkey);
    // Another account still needs the device key.
    expect(dropDeviceKey).not.toHaveBeenCalled();
  });

  it("lets the device key go with the last account on the device", async () => {
    const { held, retire, dropDeviceKey } = await deviceWith(2);
    retire(held[0]);
    retire(held[1]);
    expect(dropDeviceKey).toHaveBeenCalledTimes(1);
    expect(dropDeviceKey.mock.calls[0]).toHaveLength(1);
  });

  /** A manager over plain rows, for accounts whose signers are stand-ins. */
  function rowsManager(rows: { id: string; pubkey: string }[]) {
    return {
      get accounts() {
        return rows as never;
      },
      getAccount: (id: string) => rows.find((row) => row.id === id) as never,
      removeAccount: (account: string | { id: string }) => {
        const id = typeof account === "string" ? account : account.id;
        rows.splice(
          rows.findIndex((row) => row.id === id),
          1,
        );
      },
    };
  }

  it("keeps the identity's caches while another row still signs as it", async () => {
    const pubkey = "a".repeat(64);
    const local = { id: "local-row", pubkey, type: "local", signer: {} };
    const twin = { id: "extension-row", pubkey, type: "extension", signer: {} };
    const forgetCaches = vi.fn(async () => {});

    retireAccount(local as unknown as BrainstormAccount, { manager: rowsManager([local, twin]), forgetCaches });

    expect(forgetCaches).not.toHaveBeenCalled();
  });

  it("shuts the signer down", () => {
    const destroy = vi.fn();
    const logout = vi.fn(async () => {});
    const remote = { id: "bunker-row", pubkey: "b".repeat(64), type: "nostr-connect", signer: { destroy, logout } };

    retireAccount(remote as unknown as BrainstormAccount, {
      manager: rowsManager([remote]),
      forgetCaches: async () => {},
      dropDeviceKey: async () => false,
    });

    expect(destroy).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it("keeps the identity's caches and the device key when a new row replaces it", async () => {
    const { held, retire, forgetCaches, dropDeviceKey, managed } = await deviceWith(1);
    retireAccount(held[0], { ...managed, forgetCaches, dropDeviceKey, replaced: true });
    expect(forgetCaches).not.toHaveBeenCalled();
    expect(dropDeviceKey).not.toHaveBeenCalled();
    expect(held[0].signer.unlocked).toBe(false);
    void retire;
  });
});
