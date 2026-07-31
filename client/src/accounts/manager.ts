import { AccountManager, type SerializedAccount } from "applesauce-accounts";

import { LocalAccount } from "./local-account";
import type { LocalSignerData, LocalSignerOptions } from "./local-signer";
import type { AccountMetadata } from "./metadata";
import {
  browserStorage,
  createPersistence,
  type Persistence,
  type StorageSeam,
} from "./persist";
import { deviceUnlockCache, type UnlockCache } from "./unlock-cache";

export type ManagedAccounts = {
  manager: AccountManager<AccountMetadata>;
  persistence: Persistence;
  /** Stop saving. Production never calls it; tests and StrictMode remounts do. */
  stop(): void;
};

export type CreateManagerOptions = {
  storage?: StorageSeam;
  unlockCache?: UnlockCache;
  /** Restore from storage and start saving. Bootstrap passes false to migrate first. */
  autoStart?: boolean;
};

/**
 * The `LocalAccount` type bound to an Unlock cache, so `fromJSON` — which the
 * library calls with nothing but the serialised entry — restores Signers that
 * talk to the injected cache rather than the real one.
 */
function localAccountType(options: LocalSignerOptions) {
  return class BoundLocalAccount extends LocalAccount {
    static fromJSON(json: SerializedAccount<LocalSignerData, AccountMetadata>): LocalAccount {
      return LocalAccount.fromJSON(json, options);
    }
  };
}

/**
 * The app's account manager, with its persistence wired up.
 *
 * `PrivateKeyAccount` is deliberately **not** registered: its `toJSON` writes the
 * raw key, and no storage this app touches may ever hold one. See the plaintext
 * fence in `persist.test.ts`.
 */
export function createManager({
  storage = browserStorage(),
  unlockCache = deviceUnlockCache,
  autoStart = true,
}: CreateManagerOptions = {}): ManagedAccounts {
  const manager = new AccountManager<AccountMetadata>();
  manager.registerType(localAccountType({ unlockCache }));

  const persistence = createPersistence(manager, storage);

  let stopSaving: (() => void) | undefined;
  if (autoStart) {
    persistence.load();
    stopSaving = persistence.start();
  }

  return {
    manager,
    persistence,
    stop() {
      stopSaving?.();
      stopSaving = undefined;
    },
  };
}

let singleton: ManagedAccounts | undefined;

export function getAccounts(): ManagedAccounts {
  return (singleton ??= createManager());
}
