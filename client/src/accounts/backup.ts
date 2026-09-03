/**
 * Getting at an Account's key on purpose: the Backup the User downloads, and the
 * raw nsec they can reveal.
 *
 * Both are async, because a key at rest is encrypted — v1 read it synchronously
 * and so could only ever see one that had already been decrypted, which is why a
 * backup triggered straight after a page load threw "no key available".
 */
import type { AccountManager, BaseAccount } from "applesauce-accounts";
import { distinctUntilChanged, map, merge, of, startWith, switchMap, type Observable } from "rxjs";

import { LocalAccount } from "./local-account";
import { isUnlockCancelled, type UnlockAttemptResult } from "./local-signer";
import { getMetadata, updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";
import { activeAccount } from "./signing";

/** Thrown when the Account in hand keeps its key elsewhere — an extension, a bunker. */
export class NoLocalKeyError extends Error {
  constructor(message = "This account's key isn't stored here, so there's nothing to back up.") {
    super(message);
    this.name = "NoLocalKeyError";
  }
}

/** The Account these calls act on: the one named, or whoever is active. */
function targetAccount(account?: BrainstormAccount): BrainstormAccount | undefined {
  return account ?? activeAccount();
}

function localAccount(account: BrainstormAccount | undefined): LocalAccount {
  const holder = targetAccount(account);
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
export function canBackUp(account?: BrainstormAccount): boolean {
  return targetAccount(account) instanceof LocalAccount;
}

/**
 * Whether the key can be reached without the Recovery password — already in
 * memory, or openable from the Unlock cache. What a forgotten password can be
 * *replaced* depends on: everywhere else, forgetting it is terminal.
 */
export async function keyReachableWithoutPassword(
  account?: BrainstormAccount,
): Promise<boolean> {
  const holder = targetAccount(account);
  if (!(holder instanceof LocalAccount)) return false;
  return !holder.locked || holder.unlockSilently();
}

/**
 * The Backup this Account already holds, or nothing. Never mints, so it costs no
 * scrypt: where a password has just been *verified*, the stored ciphertext is
 * already the artefact, and re-minting would only produce a second file opening
 * on the same password.
 */
export function heldBackup(account?: BrainstormAccount): string | undefined {
  const holder = targetAccount(account);
  return holder instanceof LocalAccount ? holder.signer.data.ncryptsec : undefined;
}

/**
 * Whether this Account has been handed its Backup, or holds its key some other
 * way. **"We offered and they accepted"** — a browser reports nothing about
 * whether a download arrived, so this is the strongest claim there is, and the
 * nag chain is built on it rather than on any confirmation that doesn't exist.
 */
export function isBackedUp(account?: BrainstormAccount): boolean {
  const holder = targetAccount(account);
  return !!holder && getMetadata(holder).backedUp === true;
}

/** Record the hand-over. Rides on the Account, so a second Account can't inherit it. */
export function markBackedUp(account?: BrainstormAccount): void {
  const holder = targetAccount(account);
  if (holder && !isBackedUp(holder)) updateMetadata(holder, { backedUp: true });
}

/**
 * What this Account still needs before losing this browser stops losing it. All
 * three backup surfaces ask this one question, so they can't disagree.
 *
 * - `recovery-password` — key here, no Backup behind it (a migrated Account).
 * - `download` — a Backup exists and has never been handed over. Just as
 *   device-bound as the above: one step further along, not done.
 * - `null` — the key lives elsewhere, or the file has already been handed over.
 */
export type BackupNeed = "recovery-password" | "download";

export function backupNeed(account?: BrainstormAccount): BackupNeed | null {
  const holder = targetAccount(account);
  if (!(holder instanceof LocalAccount)) return null;
  if (isBackedUp(holder)) return null;
  return holder.signer.data.ncryptsec ? "download" : "recovery-password";
}

/**
 * The Active Account's need over time. `metadata$` carries the hand-over and
 * `changed$` the minting of a Backup, so a card rendered from this puts itself
 * away the moment either happens — neither of which touches the other's stream.
 */
export function backupNeedStream(
  manager: AccountManager<AccountMetadata>,
): Observable<BackupNeed | null> {
  return manager.active$.pipe(
    switchMap((account) => {
      if (!account) return of(null);
      const changed$ = (account.signer as { changed$?: Observable<unknown> })?.changed$;
      const metadata$ = (account as BaseAccount<any, any, AccountMetadata>).metadata$;
      return merge(metadata$, ...(changed$ ? [changed$] : [])).pipe(
        startWith(null),
        map(() => backupNeed(account as BrainstormAccount)),
      );
    }),
    distinctUntilChanged(),
  );
}

/**
 * Whether `password` opens this Account's Backup. A check, not an unlock — the
 * onboarding step's rehearsal, which catches a password typed wrong at signup
 * while the key is still unlocked and `setRecoveryPassword` can fix it.
 */
export async function verifyRecoveryPassword(
  password: string,
  account?: BrainstormAccount,
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
export async function revealSecretKey(account?: BrainstormAccount): Promise<string> {
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
