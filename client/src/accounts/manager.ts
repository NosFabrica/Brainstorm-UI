import { AccountManager, type SerializedAccount } from "applesauce-accounts";
import { AmberClipboardAccount, ExtensionAccount } from "applesauce-accounts/accounts";
import type { NostrPool } from "applesauce-signers";

import { LocalAccount } from "./local-account";
import type { LocalSignerData, LocalSignerOptions } from "./local-signer";
import type { AccountMetadata } from "./metadata";
import { RemoteAccount } from "./remote-signer";
import { installRemoteTransport } from "./remote-transport";
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
  /** The relay pool remote signers talk over. Injected so tests never open a socket. */
  transport?: NostrPool;
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
  transport,
  autoStart = true,
}: CreateManagerOptions = {}): ManagedAccounts {
  // Before anything is restored, and before the types that need it are even
  // registered: a remote signer reads the transport in its *constructor* and
  // throws without one, so an Account deserialised first would be quarantined
  // rather than merely mute — and quarantine is for the life of the browser.
  installRemoteTransport(transport);

  const manager = new AccountManager<AccountMetadata>();
  manager.registerType(localAccountType({ unlockCache }));
  // Unregistered types are quarantined on load, so an extension user's Account
  // has to be restorable here or they'd be signed out on the next reload.
  manager.registerType(ExtensionAccount);
  // One type for every remote signer — nsec.app, Amber's bunker mode, Keycast
  // and anything self-hosted. Their differences live at transport, not here.
  manager.registerType(RemoteAccount);
  manager.registerType(AmberClipboardAccount);

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
