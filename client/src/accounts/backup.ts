/**
 * Getting at an Account's key on purpose: the Backup the User downloads, and the
 * raw nsec they can reveal.
 *
 * Both are async, because a key at rest is encrypted — v1 read it synchronously
 * and so could only ever see one that had already been decrypted, which is why a
 * backup triggered straight after a page load threw "no key available".
 */
import { LocalAccount } from "./local-account";
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

/** This Account's key as a raw `nsec…`, for a deliberate reveal. */
export async function revealSecretKey(
  { account }: { account?: BrainstormAccount } = {},
): Promise<string> {
  return localAccount(account).revealNsec();
}

/**
 * Why reaching the key failed, in words the User can act on. An Account whose key
 * lives elsewhere will never produce one, so "try again" would be a lie.
 */
export function keyAccessMessage(error: unknown): string {
  return error instanceof NoLocalKeyError ? error.message : "Please try again.";
}
