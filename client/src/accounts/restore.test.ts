// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { encrypt as encryptSecretKeyNip49 } from "nostr-tools/nip49";
import { npubEncode, nsecEncode } from "nostr-tools/nip19";

import { buildAccountBackupFileContent, buildRawKeyBackupFileContent } from "@/lib/accountBackup";
import {
  backupTooExpensive,
  backupWorkFactor,
  extractKeyToken,
  MAX_IMPORT_LOGN,
  openPastedKey,
  UNUSABLE_BACKUP_MESSAGE,
} from "./restore";
import { backupAtCost, LOW_LOGN, PASSWORD } from "./test-fakes";

const secretKey = generateSecretKey();
const nsec = nsecEncode(secretKey);
const npub = npubEncode(getPublicKey(secretKey));
const ncryptsec = encryptSecretKeyNip49(secretKey, PASSWORD, LOW_LOGN);

describe("finding the key in what was pasted", () => {
  it("takes a bare encrypted key", () => {
    expect(extractKeyToken(ncryptsec)).toEqual({ kind: "ncryptsec", token: ncryptsec });
  });

  it("takes a bare nsec", () => {
    expect(extractKeyToken(nsec)).toEqual({ kind: "nsec", token: nsec });
  });

  it("ignores the whitespace a paste drags along", () => {
    expect(extractKeyToken(`  ${nsec}\n`)).toEqual({ kind: "nsec", token: nsec });
  });

  it("pulls the key out of a whole encrypted backup file — what people actually paste", () => {
    const file = buildAccountBackupFileContent(ncryptsec, npub);

    expect(extractKeyToken(file)).toEqual({ kind: "ncryptsec", token: ncryptsec });
  });

  it("pulls the key out of a whole raw-key backup file", () => {
    const file = buildRawKeyBackupFileContent(nsec, npub);

    expect(extractKeyToken(file)).toEqual({ kind: "nsec", token: nsec });
  });

  it("is not fooled by the npub the file prints beside the key", () => {
    expect(extractKeyToken(`My account is ${npub}`)).toBeNull();
  });

  it("prefers the encrypted key where a paste carries both", () => {
    expect(extractKeyToken(`${nsec}\n${ncryptsec}`)).toEqual({
      kind: "ncryptsec",
      token: ncryptsec,
    });
  });

  it("finds nothing in prose", () => {
    expect(extractKeyToken("I've lost my key, please help")).toBeNull();
    expect(extractKeyToken("")).toBeNull();
  });
});

describe("the work factor a backup arrived with", () => {
  it("reads the cost nostr-tools minted at, without the password", () => {
    expect(backupWorkFactor(ncryptsec)).toBe(LOW_LOGN);
  });

  it("reads the costs other apps mint at", () => {
    for (const logn of [16, 18, 20, 22]) {
      expect(backupWorkFactor(backupAtCost(logn))).toBe(logn);
    }
  });

  it("is unknown for something that isn't a NIP-49 payload", () => {
    expect(backupWorkFactor("ncryptsec1")).toBeUndefined();
    expect(backupWorkFactor(nsec)).toBeUndefined();
    expect(backupWorkFactor("")).toBeUndefined();
  });
});

describe("a backup this browser cannot open", () => {
  it("passes anything at or below the ceiling, including the 18 other apps mint at", () => {
    expect(backupTooExpensive(ncryptsec)).toBe(false);
    expect(backupTooExpensive(backupAtCost(18))).toBe(false);
    expect(backupTooExpensive(backupAtCost(MAX_IMPORT_LOGN))).toBe(false);
  });

  it("refuses above the ceiling, where scrypt asks for more memory than it gets", () => {
    expect(backupTooExpensive(backupAtCost(MAX_IMPORT_LOGN + 1))).toBe(true);
    expect(backupTooExpensive(backupAtCost(22))).toBe(true);
  });

  it("says nothing about an unreadable payload — the decrypt owns that failure", () => {
    expect(backupTooExpensive("ncryptsec1nonsense")).toBe(false);
  });

  it("never blames the password", () => {
    expect(UNUSABLE_BACKUP_MESSAGE).not.toMatch(/password/i);
    expect(UNUSABLE_BACKUP_MESSAGE).toMatch(/memory/i);
  });
});

describe("opening what was pasted", () => {
  it("opens a Backup this app minted before any of this existed", () => {
    const result = openPastedKey(ncryptsec, PASSWORD);

    expect(result).toEqual({ ok: true, secretKey, ncryptsec });
  });

  it("opens the whole backup file, password and all", () => {
    const result = openPastedKey(buildAccountBackupFileContent(ncryptsec, npub), PASSWORD);

    expect(result).toEqual({ ok: true, secretKey, ncryptsec });
  });

  it("opens a raw key, which carries no Backup with it", () => {
    expect(openPastedKey(nsec)).toEqual({ ok: true, secretKey });
  });

  it("asks for the password rather than guessing at one", () => {
    expect(openPastedKey(ncryptsec)).toEqual({ ok: false, reason: "no-password" });
  });

  it("says a wrong password is wrong", () => {
    expect(openPastedKey(ncryptsec, "not the password")).toEqual({
      ok: false,
      reason: "wrong-password",
    });
  });

  it("refuses a Backup minted beyond this browser, without calling the password wrong", () => {
    expect(openPastedKey(backupAtCost(22), PASSWORD)).toEqual({
      ok: false,
      reason: "unusable-backup",
    });
  });

  it("tells an empty paste from an unreadable one", () => {
    expect(openPastedKey("   ")).toEqual({ ok: false, reason: "empty" });
    expect(openPastedKey("my key is somewhere")).toEqual({ ok: false, reason: "unreadable" });
    expect(openPastedKey("nsec1butnotreally")).toEqual({ ok: false, reason: "unreadable" });
  });
});
