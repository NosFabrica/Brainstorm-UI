/**
 * One function per login method, each returning an Account, plus the two acts
 * that change who signs: adopting an Account and letting one go.
 *
 * There is exactly **one** extension-wait here. v1 had two copies with different
 * timeouts, and neither built anything the rest of the app could hold onto — the
 * extension was re-discovered at every signature instead.
 */
import { ExtensionAccount } from "applesauce-accounts/accounts";

import { accountManager } from "@/accounts";
import { LocalAccount } from "./local-account";
import type { LocalSignerOptions } from "./local-signer";
import {
  getMetadata,
  updateMetadata,
  type AccountMetadata,
  type BrainstormAccount,
} from "./metadata";

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
  }
}

/** Extensions inject `window.nostr` whenever they like, often after first paint. */
export const EXTENSION_WAIT_MS = 800;

export function waitForExtension(
  maxWaitMs = EXTENSION_WAIT_MS,
  intervalMs = 100,
): Promise<boolean> {
  if (typeof window !== "undefined" && window.nostr) return Promise.resolve(true);
  const deadline = Date.now() + maxWaitMs;
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      if (typeof window !== "undefined" && window.nostr) {
        clearInterval(poll);
        resolve(true);
      } else if (Date.now() >= deadline) {
        clearInterval(poll);
        resolve(false);
      }
    }, intervalMs);
  });
}

/**
 * The Account behind a NIP-07 extension, from the library's own constructor —
 * which asks the extension for its pubkey, so this both waits for it and proves
 * it will answer.
 *
 * @throws {ExtensionMissingError} when no extension appears, or it refuses.
 */
export async function extensionAccount(): Promise<ExtensionAccount<AccountMetadata>> {
  await waitForExtension();
  return ExtensionAccount.fromExtension<AccountMetadata>();
}

/**
 * An Account over a key this app holds.
 *
 * Persistence is not required here. Where there is no Unlock cache and no
 * Recovery password the Account lives for this tab only — worse than staying
 * signed in, but better than refusing a login outright, and until ticket 17
 * v1's own copy of the key is still written and still migrates on the next boot.
 * Ticket 12's signup password is what closes this properly.
 */
export function localAccount(
  key: Uint8Array,
  options: LocalSignerOptions & { password?: string; logn?: number; ncryptsec?: string } = {},
): Promise<LocalAccount> {
  return LocalAccount.fromKey(key, { ...options, requirePersistable: false });
}

/**
 * Hold this Account, and make it the one that signs.
 *
 * One row per identity per Signer: signing in again with the same extension, or
 * re-pasting the same key, replaces what this device already held rather than
 * leaving the picker with two rows carrying the same face and the same badge —
 * the indistinguishable pair that grouping exists to prevent. What the old row
 * knew about itself comes across; its Session doesn't, since the new one has
 * just authenticated.
 */
export function adoptAccount(account: BrainstormAccount, metadata: AccountMetadata): void {
  let carried: Partial<AccountMetadata> = {};
  for (const held of [...accountManager.accounts]) {
    if (held === account || held.pubkey !== account.pubkey || held.type !== account.type) continue;
    const { session, remembered, ...rest } = getMetadata(held as BrainstormAccount);
    carried = rest;
    forgetAccount(held as BrainstormAccount);
  }

  // metadata first: adding is what triggers a save, and one save is enough
  updateMetadata(account, { ...carried, ...metadata });
  accountManager.addAccount(account);
  accountManager.setActive(account);
}

/** Make an Account this device already holds the one that signs — the picker's act. */
export function activateAccount(account: BrainstormAccount): void {
  accountManager.setActive(account);
}

/**
 * Let an Account go: it leaves this device, keys and all, and the in-memory copy
 * goes with it — nothing may still sign as an identity this browser no longer
 * holds.
 *
 * For a Signer that reaches outside this module that means shutting it down too,
 * not just dropping the reference. A remote signer holds a live relay
 * subscription that would otherwise run for the life of the tab; Amber's holds a
 * `visibilitychange` listener that would read the clipboard on every return to
 * the app, for an identity we no longer have.
 */
export function forgetAccount(account: BrainstormAccount): void {
  accountManager.removeAccount(account);
  if (account instanceof LocalAccount) account.signer.lock();
  // `logout` is a courtesy the spec makes optional and nsec.app doesn't
  // implement, so it is sent without waiting and without caring.
  releaseSigner(account);
}

/** Shut down whatever the Signer was holding open. Best effort, always. */
function releaseSigner(account: BrainstormAccount): void {
  const signer = account.signer as { logout?: () => Promise<void>; destroy?: () => void };
  try {
    signer.destroy?.();
    void signer.logout?.().catch(() => {});
  } catch {
    /* a Signer that can't be shut down cleanly still has to leave */
  }
}

/**
 * Sign out. Removing rather than deactivating is what v1's sign-out did — it
 * deleted the key — and until the switcher offers Sign out and Remove as separate
 * acts (ticket 15) it stays the only way an Account leaves this device.
 */
export function releaseActiveAccount(): void {
  const account = accountManager.active;
  if (account) forgetAccount(account);
}
