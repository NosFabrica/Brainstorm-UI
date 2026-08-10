/**
 * Bringing the manager up, in the order the app needs it.
 *
 * **Synchronously.** `RequireAuth` asks who you are *during render*, so an
 * `await` anywhere on this path would bounce every protected route to `/login`
 * before the answer arrived. Everything here is sync: parsing the blob,
 * `fromJSON`, `setActive`, and a migration that only ever moves strings around.
 * The one genuinely async step — re-wrapping a v1 plaintext key — is scheduled
 * afterwards, and those users have had plaintext in localStorage for months.
 */
import { migrateV1, type Migration } from "./migrate";
import { createManager, type CreateManagerOptions, type ManagedAccounts } from "./manager";
import { browserStorage } from "./persist";
import { deviceUnlockCache } from "./unlock-cache";

export type BootstrapOptions = Omit<CreateManagerOptions, "autoStart"> & {
  /** See `MigrateOptions.retireV1Keys` — ticket 17 turns this on. */
  retireV1Keys?: boolean;
  /** Defers the background re-wrap past first render. Tests run it inline. */
  schedule?: (task: () => void) => void;
};

export type Bootstrapped = ManagedAccounts & {
  /**
   * Resolves when the post-render migration work is done, or undefined when there
   * was none. Production ignores it; tests await it.
   */
  migrated?: Promise<void>;
};

const afterFirstRender = (task: () => void) => void setTimeout(task, 0);

export function bootstrapAccounts({
  storage = browserStorage(),
  unlockCache = deviceUnlockCache,
  transport,
  retireV1Keys = false,
  schedule = afterFirstRender,
}: BootstrapOptions = {}): Bootstrapped {
  // Installs the remote-signer transport as its first act — see `createManager`.
  const accounts = createManager({ storage, unlockCache, transport, autoStart: false });

  // Before the restore, not after: migration no-ops once a v2 blob exists, and
  // that check is only meaningful while the manager is still empty.
  let migration: Migration | null = null;
  try {
    migration = migrateV1({ storage, signerOptions: { unlockCache }, retireV1Keys });
  } catch (err) {
    // A half-readable v1 browser is not worth failing the whole app over; it
    // costs this user a sign-in, and their keys are still where v1 left them.
    console.error("accounts: could not migrate the previous session", err);
  }

  if (migration) {
    accounts.manager.addAccount(migration.account);
    accounts.manager.setActive(migration.account);
  }

  accounts.persistence.load();
  const stopSaving = accounts.persistence.start();

  // `start()` has written the blobs by now, so the migration's own cleanup can
  // never run against storage that doesn't yet hold the replacement.
  let migrated: Promise<void> | undefined;
  if (migration) {
    const finish = migration.finish;
    migrated = new Promise<void>((resolve) => {
      schedule(() => {
        finish().catch((err) => console.error("accounts: migration follow-up failed", err)).then(
          () => resolve(),
        );
      });
    });
  }

  return { ...accounts, migrated, stop: stopSaving };
}
