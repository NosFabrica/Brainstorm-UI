/**
 * One answer to "who signs this?": the Active Account.
 *
 * v1 guessed — it preferred a stored local key, then `window.nostr`, at every
 * call site. Guessing is what let an extension sign a local Account's kind-3 and
 * overwrite the extension identity's real follow list. Here the Signer comes from
 * the Account the user chose, so there is nothing left to guess.
 */
import type { NostrEvent } from "applesauce-core/helpers/event";
import type { EventTemplate } from "applesauce-accounts";

import { accountManager } from "@/accounts";
import { LocalAccount } from "./local-account";
import { isUnlockCancelled } from "./local-signer";
import { isRemoteSignerTimeout } from "./remote-signer";
import type { BrainstormAccount } from "./metadata";

/** Thrown where an event must be signed and no Account is active. */
export class NoSignerError extends Error {
  constructor(message = "No signer available. Please sign in again.") {
    super(message);
    this.name = "NoSignerError";
  }
}

/** What a caller builds: the signer stamps `pubkey`, `id` and `sig` itself. */
export type UnsignedTemplate = Omit<EventTemplate, "created_at"> & { created_at?: number };

/**
 * What every publish path reports. `cancelled` is the one case a caller must not
 * dress up as a failure: the user was asked to unlock and said no, so there is
 * nothing to tell them they don't already know.
 */
export type PublishOutcome = {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  /** Nobody asked for this publish and the Account is Locked, so it waits for a later load. */
  deferred?: boolean;
  /** The remote signer never answered — a person has to open or re-pair it. */
  signerUnreachable?: boolean;
  relay?: string;
  accepted?: number;
  total?: number;
};

/** Turn a thrown signing error into an outcome, keeping a deliberate cancel silent. */
/**
 * A remote signer that has gone away is discovered here and nowhere else.
 *
 * NIP-46 carries no revocation signal: Amber's "Reset Bunker" mints a new
 * per-connection key and "Delete application" drops the pairing, and in both
 * cases the stored `remote` becomes a pubkey nobody listens on without a word.
 * So the first anyone hears of it is a signature that never comes back — and
 * that moment is the only one where the diagnosis is certainly right, which is
 * why it belongs here rather than in a probe that goes looking.
 *
 * The library's own message names the symptom and stops. This names the cause and
 * where to go.
 */
const SIGNER_SILENT =
  "Your signer didn't answer. Open it and check for a pending request — or connect it again from your account menu.";

export function signingFailure(error: unknown, fallback = "Signing failed"): PublishOutcome {
  if (isUnlockCancelled(error)) return { success: false, cancelled: true };
  // Flagged, not just worded: a signer that has gone quiet is waiting on a person
  // to open or re-pair it, so a caller with a retry timer must stop rather than
  // re-ask every few seconds — each attempt burning another 30s deadline.
  if (isRemoteSignerTimeout(error)) {
    return { success: false, error: SIGNER_SILENT, signerUnreachable: true };
  }
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/** The Account every user-published event is signed by, or undefined when signed out. */
export function activeAccount(): BrainstormAccount | undefined {
  return accountManager.active;
}

/** The Active Account, for paths that have nothing to publish without one. */
export function requireActiveAccount(): BrainstormAccount {
  const account = accountManager.active;
  if (!account) throw new NoSignerError();
  return account;
}

/** Sign as `account`. A Locked local key unlocks on the way through. */
export function signAs(account: BrainstormAccount, template: UnsignedTemplate): Promise<NostrEvent> {
  return account.signEvent({ created_at: Math.floor(Date.now() / 1000), ...template });
}

/**
 * NIP-44 encrypt to the Account's own key. Through the Account, never
 * `window.nostr` — reaching for the extension directly silently fails for a
 * remote signer, and signs as the wrong identity when both are present.
 */
export async function encryptToSelf(
  account: BrainstormAccount,
  plaintext: string,
): Promise<string | null> {
  try {
    return (await account.nip44?.encrypt(account.pubkey, plaintext)) ?? null;
  } catch (error) {
    // "They declined to unlock" is not "this key can't encrypt" — let the caller
    // abandon the action instead of reporting that the encryption failed.
    if (isUnlockCancelled(error)) throw error;
    return null;
  }
}

/** Inverse of `encryptToSelf`. Null when this Account can't read it. */
export async function decryptFromSelf(
  account: BrainstormAccount,
  ciphertext: string,
): Promise<string | null> {
  try {
    return (await account.nip44?.decrypt(account.pubkey, ciphertext)) ?? null;
  } catch (error) {
    if (isUnlockCancelled(error)) throw error;
    return null;
  }
}

/**
 * Whether this Account can sign without raising the Recovery-password modal. A
 * Locked local key is asked to unlock from its Unlock cache — silent, ~ms, and
 * the only way to find out. Extension and bunker Accounts may prompt in their own
 * app, which their users expect and their signers normally remember. Background
 * work asks first and skips when the answer is no, so nothing the user didn't
 * start can ever raise our modal.
 */
export function canSignSilently(account: BrainstormAccount): Promise<boolean> {
  if (!(account instanceof LocalAccount) || !account.locked) return Promise.resolve(true);
  return account.unlockSilently();
}
