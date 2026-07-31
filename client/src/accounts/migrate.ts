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
 */
import { ExtensionAccount } from "applesauce-accounts/accounts";
import { ExtensionSigner } from "applesauce-signers";
import { hexToBytes } from "nostr-tools/utils";
import { nip19 } from "nostr-tools";

import { extractAdminFlag } from "@/lib/jwt";
import { LocalAccount } from "./local-account";
import { LocalSigner, type LocalSignerOptions } from "./local-signer";
import type { AccountMetadata, BrainstormAccount } from "./metadata";
import { hasStoredAccounts, type StorageLike, type StorageSeam } from "./persist";

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
   * Delete the v1 rows once v2 holds them. **Off** until ticket 17 retires the
   * last legacy reader — `getCurrentUser`, `authenticatedFetch` and the backup
   * nags still read these keys, so removing them now would sign everyone out.
   */
  retireV1Keys?: boolean;
};

export type Migration = {
  /** The Account v1's state describes. Already carrying its metadata. */
  account: BrainstormAccount;
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

/** A plaintext key row: held unlocked in memory now, re-wrapped in `finish()`. */
type Rewrap = { signer: LocalSigner; row: Row };

type Built = {
  account: BrainstormAccount;
  remembered: boolean;
  rewrap?: Rewrap;
  /** True when the Account came from `brainstorm_sk_enc`, which it now holds. */
  usedEnvelope?: boolean;
};

function fromPlaintext(
  key: Uint8Array,
  remembered: boolean,
  row: Row,
  signerOptions: LocalSignerOptions,
): Built {
  const signer = LocalSigner.fromKey(key, signerOptions);
  return { account: new LocalAccount(signer.pubkey, signer), remembered, rewrap: { signer, row } };
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
): Built | null {
  const sessionKey = readKey(storage.tab.getItem(V1_KEYS.sessionKey));
  if (sessionKey) {
    const row = { store: storage.tab, key: V1_KEYS.sessionKey };
    return fromPlaintext(sessionKey, false, row, signerOptions);
  }

  const envelope = storage.device.getItem(V1_KEYS.encryptedKey);
  if (envelope) {
    // The envelope is opened with the pubkey as AAD, so without the cached user
    // there is nothing to open it with — v1 was in the same position. Leave the
    // row alone rather than guess.
    if (!user?.pubkey) return null;
    const signer = new LocalSigner(user.pubkey, { envelope }, signerOptions);
    return { account: new LocalAccount(user.pubkey, signer), remembered: true, usedEnvelope: true };
  }

  const legacyKey = readKey(storage.device.getItem(V1_KEYS.legacyPlaintextKey));
  if (legacyKey) {
    const row = { store: storage.device, key: V1_KEYS.legacyPlaintextKey };
    return fromPlaintext(legacyKey, true, row, signerOptions);
  }

  // No key but a cached user: the signer lives outside this app. `window.nostr`
  // is deliberately not checked — an extension injects it whenever it likes, and
  // gating on it at module load would sign these users out on a slow injection.
  // `ExtensionSigner` reaches for the extension when it signs, not when it's built.
  if (user?.pubkey) {
    return { account: new ExtensionAccount(user.pubkey, new ExtensionSigner()), remembered: true };
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
 * described *this* identity, and the envelope only when this Account holds it.
 * A cached user that names someone else is the sole route back into that
 * envelope — deleting it would strand the row rather than migrate it.
 */
function retire(
  storage: StorageSeam,
  pubkey: string,
  { ownsCachedUser, usedEnvelope }: { ownsCachedUser: boolean; usedEnvelope: boolean },
): void {
  for (const key of Object.values(flagKeys(pubkey))) storage.device.removeItem(key);
  if (usedEnvelope) storage.device.removeItem(V1_KEYS.encryptedKey);
  if (!ownsCachedUser) return;
  storage.device.removeItem(V1_KEYS.user);
  storage.device.removeItem(V1_KEYS.token);
}

/**
 * Read v1's storage and produce the Account it describes, or null when there is
 * nothing to migrate — a signed-out browser, or one v2 already owns.
 */
export function migrateV1({
  storage,
  signerOptions = {},
  retireV1Keys = false,
}: MigrateOptions): Migration | null {
  if (hasStoredAccounts(storage)) return null;

  const user = readJSON<V1User>(storage.device, V1_KEYS.user);
  const built = buildAccount(storage, user, signerOptions);
  if (!built) return null;

  const { account, remembered, rewrap, usedEnvelope = false } = built;
  account.metadata = collectMetadata(account, remembered, storage.device, user);
  const ownsCachedUser = user?.pubkey === account.pubkey;

  return {
    account,
    async finish() {
      if (rewrap) {
        await rewrap.signer.cache();
        // The plaintext only goes once the envelope that replaces it exists —
        // where there is no Unlock cache (private browsing, plain HTTP) this row
        // is still the only copy of the key.
        if (retireV1Keys && rewrap.signer.data.envelope) {
          rewrap.row.store.removeItem(rewrap.row.key);
        }
      }
      if (retireV1Keys) retire(storage, account.pubkey, { ownsCachedUser, usedEnvelope });
    },
  };
}
