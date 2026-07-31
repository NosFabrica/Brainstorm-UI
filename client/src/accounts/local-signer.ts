import { PrivateKeySigner, type ISigner } from "applesauce-signers";
import type { EventTemplate } from "applesauce-core/helpers/event";
import { getPublicKey } from "nostr-tools/pure";
import {
  encrypt as encryptSecretKeyNip49,
  decrypt as decryptSecretKeyNip49,
} from "nostr-tools/nip49";
import { Subject } from "rxjs";

import { deviceUnlockCache, type UnlockCache } from "./unlock-cache";

/**
 * Work factor for a minted Backup. Every ncryptsec Brainstorm has ever written
 * used 16, so old backups decrypt unchanged. Tests mint at 12 — logn is per
 * payload, and 16 costs ~110ms a shot.
 */
export const BACKUP_LOGN = 16;

/** Thrown when an Account holds no usable way to get at its key on this device. */
export class NoUnlockPathError extends Error {
  constructor(message = "This account cannot be unlocked on this device") {
    super(message);
    this.name = "NoUnlockPathError";
  }
}

/**
 * The two at-rest forms of a key. Both optional, and all four combinations are
 * real — see ADR 0001. `ncryptsec` is the Backup: canonical and portable.
 * `envelope` is the Unlock cache: device-bound, and only saves a password.
 */
export type LocalSignerData = { ncryptsec?: string; envelope?: string };

export type RecoveryPasswordPrompt = (signer: LocalSigner) => Promise<string>;

export type LocalSignerOptions = {
  unlockCache?: UnlockCache;
  /** Overrides the app-wide prompt. Tests pass their own; production installs one at startup. */
  requestPassword?: RecoveryPasswordPrompt;
};

let installedPrompt: RecoveryPasswordPrompt | undefined;

/** Install the app-wide Recovery password prompt (the Unlock modal). */
export function setRecoveryPasswordPrompt(prompt?: RecoveryPasswordPrompt): void {
  installedPrompt = prompt;
}

/** A Signer over a key this app holds, in whichever at-rest forms it has. */
export class LocalSigner implements ISigner {
  private inner: PrivateKeySigner | null = null;
  private pending: Promise<void> | null = null;
  private readonly unlockCache: UnlockCache;
  private readonly requestPassword?: RecoveryPasswordPrompt;

  /** Emits whenever `data` changes, so persistence can write the new at-rest form. */
  readonly changed$ = new Subject<void>();

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string) => {
      await this.unlock();
      return this.inner!.nip04.encrypt(pubkey, plaintext);
    },
    decrypt: async (pubkey: string, ciphertext: string) => {
      await this.unlock();
      return this.inner!.nip04.decrypt(pubkey, ciphertext);
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string) => {
      await this.unlock();
      return this.inner!.nip44.encrypt(pubkey, plaintext);
    },
    decrypt: async (pubkey: string, ciphertext: string) => {
      await this.unlock();
      return this.inner!.nip44.decrypt(pubkey, ciphertext);
    },
  };

  constructor(
    readonly pubkey: string,
    public data: LocalSignerData,
    options: LocalSignerOptions = {},
  ) {
    this.unlockCache = options.unlockCache ?? deviceUnlockCache;
    this.requestPassword = options.requestPassword;
  }

  get unlocked(): boolean {
    return !!this.inner;
  }

  /**
   * Memoised: concurrent callers share one in-flight unlock, so two signs on a
   * Locked Account produce exactly one password request. Applesauce unlocks
   * outside `BaseAccount`'s queue, so this is not free.
   */
  unlock(password?: string): Promise<void> {
    if (this.inner) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.doUnlock(password).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async doUnlock(password?: string): Promise<void> {
    if (this.inner) return;

    if (this.data.envelope && this.unlockCache.isSupported()) {
      try {
        // AAD is the pubkey — an envelope minted for another Account fails closed.
        this.inner = new PrivateKeySigner(
          await this.unlockCache.decrypt(this.data.envelope, this.pubkey),
        );
        return;
      } catch {
        // A stale cache holds no authority the Backup doesn't; drop it and fall through.
        this.data.envelope = undefined;
        this.changed$.next();
      }
    }

    if (!this.data.ncryptsec) throw new NoUnlockPathError();

    const recovery = password ?? (await this.prompt());
    this.inner = new PrivateKeySigner(decryptSecretKeyNip49(this.data.ncryptsec, recovery));
  }

  private prompt(): Promise<string> {
    const request = this.requestPassword ?? installedPrompt;
    if (!request) throw new NoUnlockPathError("No recovery password prompt is installed");
    return request(this);
  }

  /** Write the Unlock cache for this device. Best-effort — its absence costs convenience. */
  async cache(): Promise<void> {
    if (!this.inner || this.data.envelope || !this.unlockCache.isSupported()) return;
    try {
      this.data.envelope = await this.unlockCache.encrypt(this.inner.key, this.pubkey);
      this.changed$.next();
    } catch {
      /* the Backup still holds everything this did */
    }
  }

  /** Mint or re-mint the Backup. Requires an unlocked key. */
  async setRecoveryPassword(password: string, logn: number = BACKUP_LOGN): Promise<void> {
    if (!this.inner) throw new Error("Unlock before setting a recovery password");
    this.data.ncryptsec = encryptSecretKeyNip49(this.inner.key, password, logn);
    this.changed$.next();
  }

  /** Drop the in-memory key. The at-rest forms are untouched. */
  lock(): void {
    this.inner = null;
  }

  async getPublicKey(): Promise<string> {
    await this.unlock();
    return this.inner!.getPublicKey();
  }

  async signEvent(template: EventTemplate) {
    await this.unlock();
    return this.inner!.signEvent(template);
  }

  /** An already-unlocked Signer over `key` — the signup and paste-nsec paths. */
  static fromKey(key: Uint8Array, options: LocalSignerOptions = {}): LocalSigner {
    const signer = new LocalSigner(getPublicKey(key), {}, options);
    signer.inner = new PrivateKeySigner(key);
    return signer;
  }
}
