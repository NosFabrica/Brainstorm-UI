/**
 * The one-time v1 → v2 migration. It runs **synchronously**, before the manager
 * restores, and its whole job is that an already-signed-in user opens the app and
 * is still signed in: same identity, same device key, no prompt.
 *
 * Nothing here decrypts. The existing skVault envelope is carried across
 * **verbatim** — its AAD is the pubkey, which doesn't change — so the device key
 * in IndexedDB is never touched and the binding still holds. Only the two
 * plaintext key rows need real work, and re-wrapping them is async, so it happens
 * in `finish()` after the first render.
 *
 * Every plaintext key v1 left is migrated — as the Account, as the same key the
 * Account holds, or as its own remembered account — and its row deleted once v2
 * holds that key at rest (an Unlock-cache envelope or an ncryptsec). Raw hex stays
 * on the device only where there is no at-rest storage to move it into (no Unlock
 * cache: private browsing, plain HTTP), since that row is then the only copy.
 */
import { hexToBytes } from "nostr-tools/utils";
import { getPublicKey, nip19 } from "nostr-tools";

import { extractAdminFlag } from "@/lib/jwt";
import { BrainstormExtensionAccount } from "./extension";
import { LocalAccount } from "./local-account";
import { LocalSigner, type LocalSignerOptions } from "./local-signer";
import type { AccountMetadata, BrainstormAccount } from "./metadata";
import { hasStoredAccounts, storedEntryFor, type StorageLike, type StorageSeam } from "./persist";

/** Every v1 storage key this migration reads. Nothing else in v2 knows these names. */
export const V1_KEYS = {
  /** The signed-in user, as v1 cached it: pubkey, npub and the display fields. */
  user: "nostr_user",
  token: "brainstorm_session_token",
  /** Persistent key, device-key wrapped. Carried across untouched. */
  encryptedKey: "brainstorm_sk_enc",
  /** Persistent key, plaintext. v1's own fallback when the vault was unavailable. */
  legacyPlaintextKey: "brainstorm_sk_hex_persist",
  /** Session key, plaintext, in sessionStorage — the "don't remember me" login. */
  sessionKey: "brainstorm_sk_hex",
} as const;

/** The pubkey-namespaced flags, which become fields on the Account's metadata. */
const flagKeys = (pubkey: string) => ({
  backedUp: `brainstorm_backup_done:${pubkey}`,
  createdInApp: `brainstorm_created_inapp:${pubkey}`,
  initialSetupDone: `brainstorm_initial_setup_done:${pubkey}`,
  nip85Activated: `brainstorm_nip85_activated:${pubkey}`,
  perspective: `brainstorm_active_pov:${pubkey}`,
});

/** v1's cached user. Only `pubkey` is load-bearing; the rest seeds the display cache. */
type V1User = {
  pubkey?: string;
  npub?: string;
  displayName?: string;
  picture?: string;
  nip05?: string;
};

export type MigrateOptions = {
  storage: StorageSeam;
  /** Passed to every `LocalSigner` this mints, so tests get their own Unlock cache. */
  signerOptions?: LocalSignerOptions;
  /**
   * Delete the v1 rows once v2 holds them. On by default: this module is the only
   * thing left that knows these names, so a row it has migrated has no reader.
   */
  retireV1Keys?: boolean;
};

export type Migration = {
  /** The Account v1's state describes. Already carrying its metadata. */
  account: BrainstormAccount;
  /**
   * Other identities v1 held a key for, beside the one it was signing with: a
   * persistent plaintext key under a session key. Remembered, never active.
   */
  others: BrainstormAccount[];
  /**
   * The part that couldn't be synchronous: re-wrap a plaintext key into an Unlock
   * cache envelope, then retire what v2 now holds. Call it once the manager has
   * saved, so a failure here costs a background task and never an identity.
   */
  finish(): Promise<void>;
};

function readJSON<T>(store: StorageLike, key: string): T | null {
  const raw = store.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** A hex secret key, or null for anything that isn't one. */
function readKey(raw: string | null): Uint8Array | null {
  if (!raw) return null;
  try {
    const key = hexToBytes(raw.trim());
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function npubFor(pubkey: string, cached?: string): string | undefined {
  if (cached) return cached;
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return undefined;
  }
}

/** Where a v1 row lives, so `finish()` can delete the one it replaced. */
type Row = { store: StorageLike; key: string };

/** A plaintext key, held unlocked in memory now and re-wrapped in `finish()`; its rows go then. */
type Rewrap = { signer: LocalSigner; rows: Row[] };

type Built = {
  account: BrainstormAccount;
  remembered: boolean;
  rewrap?: Rewrap;
  /** True when the Account came from `brainstorm_sk_enc`, which it now holds. */
  usedEnvelope?: boolean;
  /** Plaintext rows of this same key, deleted once the Account is held at rest. */
  copies?: Row[];
};

function fromPlaintext(key: Uint8Array, remembered: boolean, row: Row, signerOptions: LocalSignerOptions): Built {
  const signer = LocalSigner.fromKey(key, signerOptions);
  return { account: new LocalAccount(signer.pubkey, signer), remembered, rewrap: { signer, rows: [row] } };
}

/**
 * Which Account v1's storage describes, in **v1's own unlock order** — session
 * key, then encrypted, then legacy plaintext (`nostr.ts`'s `doUnlock`). Following
 * that order rather than a tidier one guarantees we migrate the key the old build
 * was actually signing with.
 */
function buildAccount(
  storage: StorageSeam,
  user: V1User | null,
  signerOptions: LocalSignerOptions,
): (Built & { others: Built[] }) | null {
  const legacyKey = readKey(storage.device.getItem(V1_KEYS.legacyPlaintextKey));
  const legacyRow = { store: storage.device, key: V1_KEYS.legacyPlaintextKey };
  const sessionKey = readKey(storage.tab.getItem(V1_KEYS.sessionKey));
  if (sessionKey) {
    const row = { store: storage.tab, key: V1_KEYS.sessionKey };
    // A persistent plaintext key beside it is migrated too, never left as raw hex: as
    // this account, remembered (v1 brought it back from that row after the tab
    // closed), or, when it's another key, as its own remembered account.
    if (legacyKey && getPublicKey(legacyKey) === getPublicKey(sessionKey)) {
      const built = fromPlaintext(sessionKey, true, row, signerOptions);
      built.rewrap!.rows.push(legacyRow);
      return { ...built, others: [] };
    }
    const others = legacyKey ? [fromPlaintext(legacyKey, true, legacyRow, signerOptions)] : [];
    return { ...fromPlaintext(sessionKey, false, row, signerOptions), others };
  }

  const envelope = storage.device.getItem(V1_KEYS.encryptedKey);
  // The envelope is opened with the pubkey as AAD, so without the cached user
  // there is nothing to open it with — v1 was in the same position, and went on
  // to the plaintext key below. The envelope row is left alone rather than guessed at.
  if (envelope && user?.pubkey) {
    const signer = new LocalSigner(user.pubkey, { envelope }, signerOptions);
    const account = new LocalAccount(user.pubkey, signer);
    const built: Built = { account, remembered: true, usedEnvelope: true };
    // A plaintext key v1 kept beside it (its own fallback) is migrated too, never
    // left as raw hex: the same key goes once the envelope is held at rest; another
    // key is its own remembered account.
    if (!legacyKey) return { ...built, others: [] };
    if (getPublicKey(legacyKey) === user.pubkey) return { ...built, copies: [legacyRow], others: [] };
    return { ...built, others: [fromPlaintext(legacyKey, true, legacyRow, signerOptions)] };
  }

  if (legacyKey) return { ...fromPlaintext(legacyKey, true, legacyRow, signerOptions), others: [] };

  // No key but a cached user: the signer lives outside this app. `window.nostr`
  // is deliberately not checked — an extension injects it whenever it likes, and
  // gating on it at module load would sign these users out on a slow injection.
  // The extension signer reaches for the extension when it signs, not when it's built.
  if (user?.pubkey) {
    return { account: new BrainstormExtensionAccount(user.pubkey), remembered: true, others: [] };
  }

  return null;
}

/**
 * Fold v1's scattered per-user state onto the Account. The display fields and the
 * Session belong to whoever `nostr_user` names — a key that derives a different
 * pubkey is a different identity and inherits neither. The flags are already
 * pubkey-namespaced, so they travel with the key itself.
 */
function collectMetadata(
  account: BrainstormAccount,
  remembered: boolean,
  device: StorageLike,
  user: V1User | null,
): AccountMetadata {
  const metadata: AccountMetadata = { remembered };
  const pubkey = account.pubkey;

  if (user?.pubkey === pubkey) {
    metadata.name = user.displayName;
    metadata.picture = user.picture;
    metadata.nip05 = user.nip05;
    const token = device.getItem(V1_KEYS.token);
    // isAdmin is minted with the token, so the two can never drift apart again
    if (token) metadata.session = { token, isAdmin: extractAdminFlag(token) };
  }
  metadata.npub = npubFor(pubkey, user?.pubkey === pubkey ? user.npub : undefined);

  const flags = flagKeys(pubkey);
  if (device.getItem(flags.backedUp) === "true") metadata.backedUp = true;
  if (device.getItem(flags.createdInApp) === "true") metadata.createdInApp = true;
  if (device.getItem(flags.initialSetupDone) === "true") metadata.initialSetupDone = true;
  if (device.getItem(flags.nip85Activated) === "true") metadata.nip85Activated = true;

  const perspective = device.getItem(flags.perspective);
  if (perspective === "nosfabrica" || perspective === "mywot") metadata.perspective = perspective;

  return metadata;
}

/**
 * Delete only what v2 actually took. The flags are namespaced to the pubkey we
 * migrated, so they always go; `nostr_user` and the token only go when they
 * described *this* identity, and the envelope only when the entry on disk holds
 * it. A cached user that names someone else is the sole route back into that
 * envelope — deleting it would strand the row rather than migrate it.
 */
function retire(
  storage: StorageSeam,
  pubkey: string,
  { ownsCachedUser, envelopeStored }: { ownsCachedUser: boolean; envelopeStored: boolean },
): void {
  for (const key of Object.values(flagKeys(pubkey))) storage.device.removeItem(key);
  if (envelopeStored) storage.device.removeItem(V1_KEYS.encryptedKey);
  if (!ownsCachedUser) return;
  storage.device.removeItem(V1_KEYS.user);
  storage.device.removeItem(V1_KEYS.token);
}

/** Whether the v2 blob holds this identity with an at-rest form — not merely in memory. */
function heldAtRest(storage: StorageSeam, pubkey: string): boolean {
  const stored = storedEntryFor(storage, pubkey);
  return !!(stored?.signer?.envelope || stored?.signer?.ncryptsec);
}

/**
 * A plaintext key row v1 left that v2 already holds at rest — from a migration
 * that took another key before this one learned to take both. Deleted; one v2
 * doesn't hold is the only copy of that key, and stays.
 */
function retireStrayPlaintext(storage: StorageSeam): void {
  for (const { store, key } of [
    { store: storage.device, key: V1_KEYS.legacyPlaintextKey },
    { store: storage.tab, key: V1_KEYS.sessionKey },
  ]) {
    const secret = readKey(store.getItem(key));
    if (secret && heldAtRest(storage, getPublicKey(secret))) store.removeItem(key);
  }
}

/**
 * Read v1's storage and produce the Account it describes, or null when there is
 * nothing to migrate — a signed-out browser, or one v2 already owns.
 */
export function migrateV1({ storage, signerOptions = {}, retireV1Keys = true }: MigrateOptions): Migration | null {
  if (hasStoredAccounts(storage)) {
    if (retireV1Keys) retireStrayPlaintext(storage);
    return null;
  }

  const user = readJSON<V1User>(storage.device, V1_KEYS.user);
  const built = buildAccount(storage, user, signerOptions);
  if (!built) return null;

  const all: Built[] = [built, ...built.others];
  for (const each of all) each.account.metadata = collectMetadata(each.account, each.remembered, storage.device, user);

  return {
    account: built.account,
    others: built.others.map((other) => other.account),
    async finish() {
      for (const { account, rewrap, usedEnvelope = false, copies = [] } of all) {
        if (rewrap) await rewrap.signer.cache();

        // Nothing is deleted until the v2 blob has been read back and found to hold
        // this identity. `save()` is silent about failing — a blocked or over-quota
        // write only logs — and these rows are the sole copy of a remembered user's
        // key, so retiring on the assumption that the save landed is how an identity
        // is lost for good.
        const stored = retireV1Keys ? storedEntryFor(storage, account.pubkey) : null;
        if (!stored) continue;
        // An at-rest form in the blob, not merely in memory. Where there is no Unlock
        // cache (private browsing, plain HTTP) and no Backup, the v1 row is still the
        // only copy of the key and has to stay: the one case a raw hex key is kept.
        const atRest = !!(stored.signer?.envelope || stored.signer?.ncryptsec);

        if (atRest) for (const row of [...(rewrap?.rows ?? []), ...copies]) row.store.removeItem(row.key);
        retire(storage, account.pubkey, {
          ownsCachedUser: user?.pubkey === account.pubkey,
          envelopeStored: usedEnvelope && atRest,
        });
      }
    },
  };
}
