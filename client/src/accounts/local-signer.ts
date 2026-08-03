import { PrivateKeySigner, type ISigner } from "applesauce-signers";
import type { EventTemplate } from "applesauce-core/helpers/event";
import { getPublicKey } from "nostr-tools/pure";
import { nsecEncode } from "nostr-tools/nip19";
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
 * The user declined to unlock. A deliberate no, not a failure: every signing call
 * site swallows it silently rather than reporting that something went wrong.
 */
export class UnlockCancelled extends Error {
  constructor(message = "Unlock cancelled") {
    super(message);
    this.name = "UnlockCancelled";
  }
}

/** Whether this is a deliberate cancel. Name-based, so it survives a module reload. */
export function isUnlockCancelled(error: unknown): boolean {
  return error instanceof UnlockCancelled || (error as { name?: string })?.name === "UnlockCancelled";
}

/**
 * Why an attempt at the Backup failed. The distinction is load-bearing: telling
 * someone their correct password is wrong is the worst failure here, and a
 * ncryptsec minted above this browser's memory ceiling fails identically.
 */
export type UnlockFailure = "wrong-password" | "unusable-backup";

export type UnlockAttemptResult = { ok: true } | { ok: false; reason: UnlockFailure };

/** Thrown when a Recovery password handed straight in doesn't open the Backup. */
export class RecoveryPasswordError extends Error {
  constructor(readonly reason: UnlockFailure) {
    super(
      reason === "unusable-backup"
        ? "This backup needs more memory than this browser allows"
        : "That is not the recovery password for this account",
    );
    this.name = "RecoveryPasswordError";
  }
}

/**
 * Which kind of failure a Backup decrypt threw. @noble's scrypt refuses a work
 * factor above its memory ceiling with a maxmem throw, and a bad password fails
 * on the cipher's tag — indistinguishable unless we look at the message. Ticket 13
 * owns reading `logn` before we even try.
 */
export function unlockFailureOf(error: unknown): UnlockFailure {
  const message = error instanceof Error ? error.message : String(error);
  return /maxmem|memory/i.test(message) ? "unusable-backup" : "wrong-password";
}

/**
 * The two at-rest forms of a key. Both optional, and all four combinations are
 * real — see ADR 0001. `ncryptsec` is the Backup: canonical and portable.
 * `envelope` is the Unlock cache: device-bound, and only saves a password.
 */
export type LocalSignerData = { ncryptsec?: string; envelope?: string };

export type RecoveryPasswordRequest = {
  signer: LocalSigner;
  /**
   * Try one password. Blocks the main thread for 0.1–1.2s while scrypt runs, so
   * whoever calls this paints its pending state first — see `UnlockModal`.
   */
  attempt(password: string): Promise<UnlockAttemptResult>;
};

/**
 * Asks the user for the Recovery password, retrying as often as they like:
 * resolves once an attempt has unlocked the Signer, and throws `UnlockCancelled`
 * when they give up. Retry policy lives here rather than in the Signer because
 * "how many times do we ask" is a question about the person, not the key.
 */
export type RecoveryPasswordPrompt = (request: RecoveryPasswordRequest) => Promise<void>;

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

  /** Emits when the key becomes available — whatever asked for it, this Account is no longer Locked. */
  readonly unlocked$ = new Subject<void>();

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
    this.pending = this.doUnlock(password)
      .then(() => void this.unlocked$.next())
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  /**
   * Unlock from the Unlock cache alone, never asking for anything. False when
   * only the Recovery password would do — which a caller that must not prompt
   * (a background re-auth) can only learn by trying: a stale envelope is
   * indistinguishable from a good one until it is opened, and that costs ~ms.
   */
  unlockSilently(): Promise<boolean> {
    if (this.inner) return Promise.resolve(true);
    // an unlock already in flight may be a prompt; wait on its outcome rather than open a second
    if (this.pending) return this.pending.then(() => !!this.inner, () => !!this.inner);
    return this.fromCache();
  }

  private async fromCache(): Promise<boolean> {
    if (!this.data.envelope || !this.unlockCache.isSupported()) return false;
    try {
      // AAD is the pubkey — an envelope minted for another Account fails closed.
      this.inner = new PrivateKeySigner(
        await this.unlockCache.decrypt(this.data.envelope, this.pubkey),
      );
      return true;
    } catch {
      // A stale cache holds no authority the Backup doesn't; drop it and fall through.
      this.data.envelope = undefined;
      this.changed$.next();
      return false;
    }
  }

  /**
   * Whether the Unlock cache still opens this key — asked *about* an Account
   * nobody has chosen, so the key is decrypted and discarded, and a failure
   * leaves the envelope alone. Only a real unlock may drop an at-rest form.
   */
  async probeUnlockCache(): Promise<boolean> {
    if (this.inner) return true;
    if (!this.data.envelope || !this.unlockCache.isSupported()) return false;
    try {
      await this.unlockCache.decrypt(this.data.envelope, this.pubkey);
      return true;
    } catch {
      return false;
    }
  }

  private async doUnlock(password?: string): Promise<void> {
    if (this.inner) return;
    if (await this.fromCache()) return;

    if (!this.data.ncryptsec) throw new NoUnlockPathError();

    if (password !== undefined) {
      const result = this.tryBackup(password);
      if (!result.ok) throw new RecoveryPasswordError(result.reason);
      return;
    }

    await this.prompt();
    // A prompt that returns without unlocking would leave the caller signing with
    // nothing at all, so treat it as terminal rather than trusting it.
    if (!this.inner) throw new NoUnlockPathError("The recovery password prompt returned locked");
  }

  /**
   * One decrypt attempt against the Backup, keeping the key when it opens.
   * Synchronous by nature: scrypt blocks the main thread, and @noble's async
   * variant doesn't help — its yield is a microtask that never reaches the event
   * loop, so no spinner can animate through it.
   */
  private tryBackup(password: string): UnlockAttemptResult {
    try {
      this.inner = new PrivateKeySigner(decryptSecretKeyNip49(this.data.ncryptsec!, password));
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: unlockFailureOf(error) };
    }
  }

  private prompt(): Promise<void> {
    const request = this.requestPassword ?? installedPrompt;
    if (!request) throw new NoUnlockPathError("No recovery password prompt is installed");
    return request({ signer: this, attempt: async (password) => this.tryBackup(password) });
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

  /**
   * A Backup under `password`, minted without touching the stored one — the file
   * the user downloads is a copy, so a second download under a second password
   * doesn't silently move the Account onto it.
   */
  async mintBackup(password: string, logn: number = BACKUP_LOGN): Promise<string> {
    await this.unlock();
    return encryptSecretKeyNip49(this.inner!.key, password, logn);
  }

  /** The key as a raw `nsec…`, for a deliberate reveal. Never written to disk. */
  async revealNsec(): Promise<string> {
    await this.unlock();
    return nsecEncode(this.inner!.key);
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
