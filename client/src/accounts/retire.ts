/**
 * Letting an Account go — the one path for every way it leaves: "Remove from
 * device", a re-login replacing its row, another tab removing it.
 *
 * Each of those used to do part of it. What has to go:
 * - the key in memory, and the at-rest forms the signer object still held
 *   (`LocalSigner.forget`), which anything still holding the signer re-opened;
 * - whatever the signer holds open (`releaseSigner`): a remote signer's relay
 *   subscription, Amber's `visibilitychange` listener;
 * - its rows in the accounts backup and quarantine, never pruned otherwise;
 * - once no Account here signs as its identity, its kept private messages and
 *   its own cached events;
 * - once no account is left on the device at all, the device key.
 */
import type { AccountManager } from "applesauce-accounts";

import { dropDeviceKeyIfUnneeded } from "./device-key";
import { forgetDmCacheFor } from "@/lib/dm/cache";
import { forgetEventCacheFor } from "@/lib/eventCache";
import { LocalAccount } from "./local-account";
import type { AccountMetadata, BrainstormAccount } from "./metadata";
import type { Persistence } from "./persist";

/** Shut down whatever the Signer was holding open. Best effort, always. */
export function releaseSigner(account: BrainstormAccount): void {
  const signer = account.signer as { logout?: () => Promise<void>; destroy?: () => void };
  try {
    signer.destroy?.();
    // `logout` is a courtesy the spec makes optional and nsec.app doesn't
    // implement, so it is sent without waiting and without caring.
    void signer.logout?.().catch(() => {});
  } catch {
    /* a Signer that can't be shut down cleanly still has to leave */
  }
}

/** What this tab holds of it in memory: the key, the at-rest forms on the signer, its connections. */
export function retireInMemory(account: BrainstormAccount): void {
  if (account instanceof LocalAccount) account.signer.forget();
  releaseSigner(account);
}

/** Its kept private messages and its own cached events. */
async function forgetCachesFor(pubkey: string): Promise<void> {
  await Promise.all([forgetDmCacheFor(pubkey), forgetEventCacheFor(pubkey)]);
}

export type RetireDeps = {
  manager: Pick<AccountManager<AccountMetadata>, "accounts" | "removeAccount" | "getAccount">;
  persistence?: Pick<Persistence, "scrub" | "holdsAccounts">;
  /** Test seams. */
  forgetCaches?: (pubkey: string) => Promise<void>;
  dropDeviceKey?: (stillNeeded: () => boolean) => Promise<boolean>;
  /**
   * A new row for the same identity and signer is taking its place (accounts/login
   * adoptAccount): the identity stays, and so do its caches and the device key the
   * new row's envelope was just sealed with.
   */
  replaced?: boolean;
};

/** Remove `account` from the manager and from this device, everything it held with it. */
export function retireAccount(account: BrainstormAccount, deps: RetireDeps): void {
  const { manager, persistence } = deps;
  if (manager.getAccount(account.id)) manager.removeAccount(account);
  retireInMemory(account);
  const identityGone = !deps.replaced && !manager.accounts.some((held) => held.pubkey === account.pubkey);
  persistence?.scrub(account, { identityGone });
  if (deps.replaced) return;
  if (identityGone) void (deps.forgetCaches ?? forgetCachesFor)(account.pubkey).catch(() => {});
  const stillNeeded = () => manager.accounts.length > 0 || (persistence?.holdsAccounts() ?? true);
  if (!stillNeeded()) void (deps.dropDeviceKey ?? dropDeviceKeyIfUnneeded)(stillNeeded).catch(() => false);
}
