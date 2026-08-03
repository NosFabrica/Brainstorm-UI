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
import { updateMetadata, type AccountMetadata, type BrainstormAccount } from "./metadata";

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
  options: LocalSignerOptions & { password?: string; logn?: number } = {},
): Promise<LocalAccount> {
  return LocalAccount.fromKey(key, { ...options, requirePersistable: false });
}

/** Hold this Account, and make it the one that signs. */
export function adoptAccount(account: BrainstormAccount, metadata: AccountMetadata): void {
  // metadata first: adding is what triggers a save, and one save is enough
  updateMetadata(account, metadata);
  accountManager.addAccount(account);
  accountManager.setActive(account);
}

/**
 * Sign out: the Active Account leaves this device, keys and all. Removing rather
 * than deactivating is what v1's sign-out did — it deleted the key — and the
 * in-memory copy goes with it, so nothing can still sign as an identity this
 * browser no longer holds.
 */
export function releaseActiveAccount(): void {
  const account = accountManager.active;
  if (!account) return;
  accountManager.removeAccount(account);
  if (account instanceof LocalAccount) account.signer.lock();
}
