/**
 * At-rest encryption for the persisted account secret key ("device-key wrap").
 *
 * The problem this solves: we used to write the raw secret key as plaintext hex
 * into `localStorage`, so anything that can read localStorage (a rogue script/
 * extension, a copied storage dump) got the key outright. This module wraps the
 * key with a **non-extractable** AES-GCM key that lives in IndexedDB — the raw
 * bytes of that wrapping key can never be read back out by JavaScript, even by
 * code running in our own origin. localStorage then holds only ciphertext.
 *
 * Threat model (honest ceiling): this defeats anything that reads/exfiltrates
 * `localStorage`. It does NOT defeat full in-origin code execution (an XSS that
 * itself calls `crypto.subtle.decrypt`) or a forensic copy of the browser
 * profile directory where the on-disk key material may be recoverable. No
 * browser-resident key wins those — this is a large improvement over plaintext,
 * not a claim of perfect secrecy.
 *
 * The ciphertext is bound to the account pubkey via AES-GCM additional
 * authenticated data (AAD), so an envelope minted for one account cannot be
 * silently decrypted under a different logged-in account — it fails closed.
 *
 * The decrypted key is NEVER written back to any storage API by this module;
 * callers hold it in memory only. When IndexedDB / WebCrypto is unavailable
 * (e.g. some private-browsing modes), `isVaultSupported()` returns false and the
 * caller falls back to today's plaintext-persist behavior.
 */

const DB_NAME = "brainstorm-vault";
const STORE = "keys";
const DEVICE_KEY_ID = "device";
const VERSION = "v1";

/** Secure context + IndexedDB + WebCrypto all present. */
export function isVaultSupported(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof indexedDB !== "undefined" &&
      !!window.isSecureContext &&
      typeof crypto !== "undefined" &&
      !!crypto.subtle
    );
  } catch {
    return false;
  }
}

// ---- base64 (binary-safe) ----------------------------------------------------
function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- IndexedDB (tiny promise wrapper, no external dep) -----------------------
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(key: string): Promise<unknown> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

function idbPut(key: string, val: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// ---- device key --------------------------------------------------------------
// Non-extractable AES-GCM key, created lazily and reused for the life of the
// device. It's a device secret, not an account secret — it persists across
// logout/login and account switches (logout wipes the ciphertext it unlocks, so
// the key alone is inert). Cached as a promise so repeated ops don't re-open IDB.
let deviceKeyPromise: Promise<CryptoKey> | null = null;

function getDeviceKey(): Promise<CryptoKey> {
  if (!deviceKeyPromise) {
    deviceKeyPromise = (async () => {
      const existing = await idbGet(DEVICE_KEY_ID);
      if (existing) return existing as CryptoKey;
      const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false, // non-extractable — raw bytes never exposed to JS
        ["encrypt", "decrypt"],
      );
      await idbPut(DEVICE_KEY_ID, key);
      return key;
    })().catch((err) => {
      deviceKeyPromise = null; // let a later call retry
      throw err;
    });
  }
  return deviceKeyPromise;
}

// ---- public API --------------------------------------------------------------
/**
 * Encrypt `secret` (the raw secret-key bytes) into a versioned envelope string
 * `v1:<base64 iv>:<base64 ciphertext>`, bound to `pubkeyHex` via AAD. Throws if
 * the vault is unavailable — callers gate on `isVaultSupported()` and fall back.
 */
export async function encryptSecret(secret: Uint8Array, pubkeyHex: string): Promise<string> {
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(pubkeyHex);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, secret),
  );
  return `${VERSION}:${b64encode(iv)}:${b64encode(ct)}`;
}

/**
 * Decrypt an envelope produced by `encryptSecret`, verifying it was minted for
 * `pubkeyHex` (AAD). Throws on a bad/foreign/corrupt envelope or wrong account —
 * callers treat a throw as "no usable key" (re-login).
 */
export async function decryptSecret(envelope: string, pubkeyHex: string): Promise<Uint8Array> {
  const parts = envelope.split(":");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new Error("skVault: unrecognized envelope format");
  }
  const iv = b64decode(parts[1]);
  const ct = b64decode(parts[2]);
  const key = await getDeviceKey();
  const aad = new TextEncoder().encode(pubkeyHex);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad }, key, ct);
  return new Uint8Array(pt);
}
