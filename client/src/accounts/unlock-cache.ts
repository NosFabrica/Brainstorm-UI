/**
 * The Unlock cache seam. `lib/skVault.ts` is the real one — a device-bound
 * WebCrypto envelope — but it needs IndexedDB and `crypto.subtle`, neither of
 * which exists in jsdom, so everything that touches it takes an `UnlockCache`
 * rather than importing it.
 */
import { decryptSecret, encryptSecret, isVaultSupported } from "@/lib/skVault";

export interface UnlockCache {
  /** False in private browsing and on plain HTTP — the cache simply doesn't exist there. */
  isSupported(): boolean;
  encrypt(secret: Uint8Array, pubkey: string): Promise<string>;
  decrypt(envelope: string, pubkey: string): Promise<Uint8Array>;
}

export const deviceUnlockCache: UnlockCache = {
  isSupported: isVaultSupported,
  encrypt: encryptSecret,
  decrypt: decryptSecret,
};
