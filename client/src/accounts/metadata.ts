import type { IAccount } from "applesauce-accounts";

/**
 * Everything the app keeps per Account. Rides in `SerializedAccount.metadata`, so
 * there are no pubkey-namespaced localStorage keys and no separate session store.
 */
export type AccountMetadata = {
  /** Kept on this device and listed at sign-in, rather than dying with the tab. */
  remembered: boolean;

  // display cache, so the picker can render before any relay round-trip
  name?: string;
  picture?: string;
  nip05?: string;
  npub?: string;

  /** The backend's acceptance of this Account. `isAdmin` is written with the token so they can't drift. */
  session?: { token: string; isAdmin: boolean };

  /** Handed its Backup, or holding its key some other way. "We offered and they accepted." */
  backedUp?: boolean;
  /** When the recurring backup reminder was last snoozed. It returns; it never goes for good. */
  backupRemindedAt?: number;
  createdInApp?: boolean;
  initialSetupDone?: boolean;
  nip85Activated?: boolean;
  perspective?: "nosfabrica" | "mywot";
};

export type BrainstormAccount = IAccount<any, any, AccountMetadata>;

const EMPTY: AccountMetadata = { remembered: false };

export function getMetadata(account: BrainstormAccount): AccountMetadata {
  return account.metadata ?? EMPTY;
}

/** Merge a patch into an Account's metadata. Replaces the object, so `metadata$` emits. */
export function updateMetadata(
  account: BrainstormAccount,
  patch: Partial<AccountMetadata>,
): AccountMetadata {
  const next = { ...getMetadata(account), ...patch };
  account.metadata = next;
  return next;
}

export function isRemembered(account: BrainstormAccount): boolean {
  return getMetadata(account).remembered === true;
}
