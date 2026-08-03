/**
 * Fakes and fixtures for the accounts tests. jsdom has no IndexedDB and no
 * `crypto.subtle`, so the real Unlock cache is unavailable — this stands in for
 * it, and the storage seam keeps a test off `localStorage` entirely.
 */
import { vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { encrypt as encryptSecretKeyNip49 } from "nostr-tools/nip49";
import { npubEncode } from "nostr-tools/nip19";

import { UnlockCancelled, type RecoveryPasswordRequest } from "./local-signer";
import { createMemoryStorage, type StorageSeam } from "./persist";
import type { UnlockCache } from "./unlock-cache";

export const PASSWORD = "correct horse battery staple";

/** Mint fixtures at a low work factor — logn 16 costs ~110ms a shot. */
export const LOW_LOGN = 12;

export type FakeUnlockCache = UnlockCache & {
  /** Flip to simulate private browsing / plain HTTP, where there is no cache. */
  supported: boolean;
  /** Drop every envelope, making any outstanding one stale. */
  wipe(): void;
};

export function createFakeUnlockCache(): FakeUnlockCache {
  const envelopes = new Map<string, { secret: Uint8Array; pubkey: string }>();
  let counter = 0;

  return {
    supported: true,
    isSupported() {
      return this.supported;
    },
    async encrypt(secret, pubkey) {
      const id = `fake-envelope-${counter++}`;
      envelopes.set(id, { secret: new Uint8Array(secret), pubkey });
      return id;
    },
    async decrypt(envelope, pubkey) {
      const found = envelopes.get(envelope);
      // AAD is the pubkey — a foreign envelope fails closed, as skVault's does.
      if (!found || found.pubkey !== pubkey) throw new Error("fake cache: bad envelope");
      return new Uint8Array(found.secret);
    },
    wipe() {
      envelopes.clear();
    },
  };
}

/**
 * A Recovery password prompt that tries each password in turn and gives up when
 * they run out — as a User who cancels does. Defaults to the right one, first go.
 */
export function fakePrompt(...passwords: string[]) {
  const answers = passwords.length ? passwords : [PASSWORD];
  return vi.fn(async ({ attempt }: RecoveryPasswordRequest) => {
    for (const password of answers) {
      if ((await attempt(password)).ok) return;
    }
    throw new UnlockCancelled();
  });
}

export function createTestStorage(): StorageSeam {
  return { device: createMemoryStorage(), tab: createMemoryStorage() };
}

/** v1's `nostr_user` blob, as the old build wrote it. */
export function v1UserBlob(pubkey: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ pubkey, npub: npubEncode(pubkey), ...extra });
}

/** A key with both at-rest forms already minted, plus the cache that holds one. */
export async function keyFixture() {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  const unlockCache = createFakeUnlockCache();
  return {
    secretKey,
    pubkey,
    unlockCache,
    ncryptsec: encryptSecretKeyNip49(secretKey, PASSWORD, LOW_LOGN),
    envelope: await unlockCache.encrypt(secretKey, pubkey),
  };
}
