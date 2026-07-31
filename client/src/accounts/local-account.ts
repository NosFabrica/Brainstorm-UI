import { BaseAccount, type SerializedAccount } from "applesauce-accounts";

import type { AccountMetadata } from "./metadata";
import {
  LocalSigner,
  NoUnlockPathError,
  type LocalSignerData,
  type LocalSignerOptions,
} from "./local-signer";

/**
 * An Account whose key this app holds. Every sign, encrypt and decrypt routes
 * through `operation()`, so no caller has to remember to unlock first, and a
 * failure throws rather than leaving a key-shaped hole behind a presence check.
 */
export class LocalAccount extends BaseAccount<LocalSigner, LocalSignerData, AccountMetadata> {
  static readonly type = "brainstorm-local";

  get locked(): boolean {
    return !this.signer.unlocked;
  }

  /**
   * Whether this Account survives a reload. False only in the window between a
   * key arriving and its first at-rest form being written — and permanently on a
   * browser with no Unlock cache and no Backup, where writing the row would park
   * an identity nothing can ever open.
   */
  get persistable(): boolean {
    return !!(this.signer.data.envelope || this.signer.data.ncryptsec);
  }

  /** Unlock and populate the Unlock cache. The first unlock on a device writes it. */
  async unlock(password?: string): Promise<void> {
    await this.signer.unlock(password);
    await this.signer.cache();
  }

  /** Unlock from the Unlock cache alone. False when only a Recovery password would do. */
  unlockSilently(): Promise<boolean> {
    return this.signer.unlockSilently();
  }

  protected async operation<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.signer.unlocked) await this.unlock();
    return super.operation(operation);
  }

  toJSON(): SerializedAccount<LocalSignerData, AccountMetadata> {
    // a copy: a later cache write must not mutate a blob already handed out
    return this.saveCommonFields({ signer: { ...this.signer.data } });
  }

  static fromJSON(
    json: SerializedAccount<LocalSignerData, AccountMetadata>,
    options?: LocalSignerOptions,
  ): LocalAccount {
    const signer = new LocalSigner(json.pubkey, { ...json.signer }, options);
    return super.loadCommonFields(new LocalAccount(json.pubkey, signer), json);
  }

  /** A new Account from a raw key: unlocked, cached, and with a Backup if a password is given. */
  static async fromKey(
    key: Uint8Array,
    options: LocalSignerOptions & { password?: string; logn?: number } = {},
  ): Promise<LocalAccount> {
    const signer = LocalSigner.fromKey(key, options);
    if (options.password) await signer.setRecoveryPassword(options.password, options.logn);
    await signer.cache();

    // No Unlock cache and no Backup means the key would exist only until this page
    // unloads, and would persist as a row nothing can ever open. Where the cache is
    // unavailable, a Recovery password is the only at-rest form there is.
    if (!signer.data.ncryptsec && !signer.data.envelope) {
      throw new NoUnlockPathError("This browser cannot store a key without a recovery password");
    }

    return new LocalAccount(signer.pubkey, signer);
  }
}
