/**
 * Reading a Backup someone brings back: what they pasted, and what it will cost
 * to open — both answered before any password is tried.
 *
 * People paste the whole `.txt`, not the one line inside it, and every backup
 * file Brainstorm has ever written is still out there telling them to. And a
 * NIP-49 payload carries its own work factor, which whoever minted it chose: a
 * key from an app that mints at 22 cannot be opened in a browser at all, and
 * scrypt reports that failure exactly as it reports a wrong password. Reading
 * the cost first is what keeps us from telling someone their correct password
 * is wrong.
 */

import { decrypt as decryptSecretKeyNip49 } from "nostr-tools/nip49";
import { decode as decodeNip19 } from "nostr-tools/nip19";

/** Bech32's data alphabet — no `1`, `b`, `i` or `o`, so a separator is unambiguous. */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

const NCRYPTSEC = new RegExp(`ncryptsec1[${CHARSET}]+`, "i");
const NSEC = new RegExp(`nsec1[${CHARSET}]+`, "i");

export type RestoreToken = { kind: "ncryptsec" | "nsec"; token: string };

/**
 * The key inside whatever was pasted — a bare token, or the backup file around
 * it. `1` is not in the bech32 alphabet, so `nsec1…` can never appear inside an
 * `ncryptsec1…`; the two never collide.
 *
 * Where a paste carries both, the encrypted one wins: nothing should quietly
 * prefer the plaintext path.
 */
export function extractKeyToken(pasted: string): RestoreToken | null {
  const encrypted = NCRYPTSEC.exec(pasted);
  if (encrypted) return { kind: "ncryptsec", token: encrypted[0].toLowerCase() };
  const raw = NSEC.exec(pasted);
  return raw ? { kind: "nsec", token: raw[0].toLowerCase() } : null;
}

/**
 * The work factor a NIP-49 payload was minted at, or nothing where it can't be
 * read. `logn` is the second byte, so only the first four bech32 characters are
 * decoded — no checksum, no key material, nothing that could throw for a reason
 * this has an opinion about.
 */
export function backupWorkFactor(ncryptsec: string): number | undefined {
  const data = ncryptsec.trim().toLowerCase().split("1").slice(1).join("1");
  if (data.length < 4) return undefined;

  const words: number[] = [];
  for (const char of data.slice(0, 4)) {
    const value = CHARSET.indexOf(char);
    if (value < 0) return undefined;
    words.push(value);
  }

  // Five bits per character: the version byte is bits 0-7, `logn` is bits 8-15.
  const version = (words[0] << 3) | (words[1] >> 2);
  if (version !== 2) return undefined;
  return ((words[1] & 0b11) << 6) | (words[2] << 1) | (words[3] >> 4);
}

/**
 * The most expensive Backup this app will try to open. scrypt at `logn` n asks
 * for 128·r·(N+p) bytes — 512 MiB at 19 and 1 GiB at 20, where @noble's own
 * ceiling sits and any overshoot is fatal. 18 is what gossip and nvault mint at
 * by default, so the ceiling has to sit above it.
 */
export const MAX_IMPORT_LOGN = 19;

/** Never "wrong password": scrypt reports both failures the same way. */
export const UNUSABLE_BACKUP_MESSAGE =
  "This backup needs more memory than this browser allows. It was encrypted by an app that protects keys more heavily than this one can open.";

/**
 * Whether opening this Backup would cost more memory than a browser has. False
 * for a payload we can't read: an unreadable one fails on its own terms, and
 * claiming it's too expensive would be a guess.
 */
export function backupTooExpensive(ncryptsec: string): boolean {
  const logn = backupWorkFactor(ncryptsec);
  return logn !== undefined && logn > MAX_IMPORT_LOGN;
}

/**
 * Why an attempt at a Backup failed. The distinction is load-bearing: telling
 * someone their correct password is wrong is the worst failure available here,
 * and a ncryptsec minted above this browser's memory ceiling fails identically.
 */
export type UnlockFailure = "wrong-password" | "unusable-backup";

/**
 * Which kind of failure a decrypt threw — the backstop behind
 * `backupTooExpensive`, which catches the same case before anything is
 * attempted. @noble's scrypt refuses a work factor above its memory ceiling with
 * a maxmem throw, the engine refuses the allocation just under it, and a bad
 * password fails on the cipher's tag: indistinguishable unless we look.
 */
export function unlockFailureOf(error: unknown): UnlockFailure {
  const message = error instanceof Error ? error.message : String(error);
  return /maxmem|memory|allocat/i.test(message) ? "unusable-backup" : "wrong-password";
}

/** Why a paste didn't yield a key. `no-password` is a prompt, not a failure. */
export type RestoreFailure = "empty" | "unreadable" | "no-password" | UnlockFailure;

export type RestoreResult =
  | { ok: true; secretKey: Uint8Array; ncryptsec?: string }
  | { ok: false; reason: RestoreFailure };

/**
 * Open whatever someone pasted to get back in: a raw nsec, or an encrypted
 * Backup and its password — from a bare token or the whole file around it.
 *
 * A Backup hands its ciphertext back alongside the key, because that is the
 * Backup this account then has: the one its owner holds a file of, at the work
 * factor they chose. Nothing here re-mints.
 */
export function openPastedKey(pasted: string, password?: string): RestoreResult {
  if (!pasted.trim()) return { ok: false, reason: "empty" };

  const found = extractKeyToken(pasted);
  if (!found) return { ok: false, reason: "unreadable" };

  if (found.kind === "nsec") {
    try {
      const decoded = decodeNip19(found.token);
      if (decoded.type !== "nsec") return { ok: false, reason: "unreadable" };
      return { ok: true, secretKey: decoded.data };
    } catch {
      return { ok: false, reason: "unreadable" };
    }
  }

  if (!password) return { ok: false, reason: "no-password" };
  // Read the cost first: above the ceiling scrypt throws for memory, which is
  // reported the same way a wrong password is.
  if (backupTooExpensive(found.token)) return { ok: false, reason: "unusable-backup" };
  try {
    return { ok: true, secretKey: decryptSecretKeyNip49(found.token, password), ncryptsec: found.token };
  } catch (error) {
    return { ok: false, reason: unlockFailureOf(error) };
  }
}
