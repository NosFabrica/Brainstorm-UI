/**
 * NIP-17 file messages (kind 15): the file is encrypted with a fresh AES-GCM
 * key before it is uploaded, and the key travels only inside the gift-wrapped
 * message. The host stores ciphertext it cannot read.
 */

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^([0-9a-f]{2})+$/.test(clean)) throw new Error("not hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export interface EncryptedFile {
  cipher: Uint8Array;
  keyHex: string;
  nonceHex: string;
  /** sha256 of the ciphertext (the `x` tag) and of the original (`ox`). */
  hash: string;
  originalHash: string;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function encryptFile(plain: Uint8Array): Promise<EncryptedFile> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, plain));
  return {
    cipher,
    keyHex: toHex(key),
    nonceHex: toHex(nonce),
    hash: await sha256(cipher),
    originalHash: await sha256(plain),
  };
}

/** Decrypt a downloaded file. Throws if the key, nonce or ciphertext don't match. */
export async function decryptFile(cipher: Uint8Array, keyHex: string, nonceHex: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", fromHex(keyHex), "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(nonceHex) }, cryptoKey, cipher));
}

/** Verify a download against the `x` tag before decrypting it. */
export async function matchesHash(cipher: Uint8Array, hash: string | undefined): Promise<boolean> {
  return !hash || (await sha256(cipher)) === hash.toLowerCase();
}

/** The largest attachment we'll encrypt in the browser and send. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** The kind-15 tags for an encrypted upload. */
export function fileTags(file: { type: string; size: number }, enc: EncryptedFile, dim?: string): string[][] {
  const tags = [
    ["file-type", file.type || "application/octet-stream"],
    ["encryption-algorithm", "aes-gcm"],
    ["decryption-key", enc.keyHex],
    ["decryption-nonce", enc.nonceHex],
    ["x", enc.hash],
    ["ox", enc.originalHash],
    ["size", String(file.size)],
  ];
  if (dim) tags.push(["dim", dim]);
  return tags;
}
