/**
 * Getting at an Account's key on purpose: the Backup the User downloads, and the
 * raw nsec they can reveal.
 *
 * Both are async, because a key at rest is encrypted — v1 read it synchronously
 * and so could only ever see one that had already been decrypted, which is why a
 * backup triggered straight after a page load threw "no key available".
 */
import { LocalAccount } from "./local-account";
import { isUnlockCancelled, type UnlockAttemptResult } from "./local-signer";
import type { BrainstormAccount } from "./metadata";
import { activeAccount } from "./signing";

/** Thrown when the Account in hand keeps its key elsewhere — an extension, a bunker. */
export class NoLocalKeyError extends Error {
  constructor(message = "This account's key isn't stored here, so there's nothing to back up.") {
    super(message);
    this.name = "NoLocalKeyError";
  }
}

function localAccount(account: BrainstormAccount | undefined): LocalAccount {
  const holder = account ?? activeAccount();
  if (!(holder instanceof LocalAccount)) throw new NoLocalKeyError();
  return holder;
}

/**
 * The Backup for this Account: its key encrypted under `password`. The stored
 * Backup is left as it is — this is the copy that goes in the file.
 *
 * `account` defaults to the Active Account. `logn` is the work factor, which
 * production never passes; tests mint cheaply, as `LocalAccount.fromKey` lets them.
 */
export async function mintBackup(
  password: string,
  { account, logn }: { account?: BrainstormAccount; logn?: number } = {},
): Promise<string> {
  return localAccount(account).mintBackup(password, logn);
}

/**
 * Long enough that a typo is the likelier failure. No composition rules and no
 * maximum: there is no server to brute-force, so weakness is cheap here and a
 * typo is unrecoverable.
 */
export const MIN_RECOVERY_PASSWORD_LENGTH = 8;

/** Whether this Account's key is ours to back up — false for an extension or a bunker. */
export function canBackUp({ account }: { account?: BrainstormAccount } = {}): boolean {
  return (account ?? activeAccount()) instanceof LocalAccount;
}

/**
 * Whether the key can be reached without the Recovery password — already in
 * memory, or openable from the Unlock cache. What a forgotten password can be
 * *replaced* depends on: everywhere else, forgetting it is terminal.
 */
export async function keyReachableWithoutPassword(
  { account }: { account?: BrainstormAccount } = {},
): Promise<boolean> {
  const holder = account ?? activeAccount();
  if (!(holder instanceof LocalAccount)) return false;
  return !holder.locked || holder.unlockSilently();
}

/**
 * The Backup this Account already holds, or nothing. Never mints, so it costs no
 * scrypt: where a password has just been *verified*, the stored ciphertext is
 * already the artefact, and re-minting would only produce a second file opening
 * on the same password.
 */
export function heldBackup({ account }: { account?: BrainstormAccount } = {}): string | undefined {
  const holder = account ?? activeAccount();
  return holder instanceof LocalAccount ? holder.signer.data.ncryptsec : undefined;
}

/**
 * Whether `password` opens this Account's Backup. A check, not an unlock — the
 * onboarding step's rehearsal, which catches a password typed wrong at signup
 * while the key is still unlocked and `setRecoveryPassword` can fix it.
 */
export async function verifyRecoveryPassword(
  password: string,
  { account }: { account?: BrainstormAccount } = {},
): Promise<UnlockAttemptResult> {
  return localAccount(account).signer.verifyRecoveryPassword(password);
}

/**
 * Move this Account onto `password`, re-minting the stored Backup. Unlike
 * `mintBackup` this *changes which password opens the Account*, so it belongs to
 * the paths that say so.
 */
export async function setRecoveryPassword(
  password: string,
  { account, logn }: { account?: BrainstormAccount; logn?: number } = {},
): Promise<void> {
  return localAccount(account).setRecoveryPassword(password, logn);
}

/** This Account's key as a raw `nsec…`, for a deliberate reveal. */
export async function revealSecretKey(
  { account }: { account?: BrainstormAccount } = {},
): Promise<string> {
  return localAccount(account).revealNsec();
}

/**
 * Why reaching the key failed, in words the User can act on. An Account whose key
 * lives elsewhere will never produce one, so "try again" would be a lie.
 *
 * **Null where the User declined to unlock**: they chose not to, so there is
 * nothing to tell them. The nullable return is deliberate — it makes every caller
 * handle the cancel to compile.
 */
export function keyAccessMessage(error: unknown): string | null {
  if (isUnlockCancelled(error)) return null;
  return error instanceof NoLocalKeyError ? error.message : "Please try again.";
}
