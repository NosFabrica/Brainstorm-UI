import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAccountBackupFileContent,
  downloadAccountBackup,
  downloadBackupFile,
  downloadRawKeyBackup,
  getEncryptedBackupCredential,
  heldBackupCredential,
} from "./accountBackup";

const NPUB = "npub1lira";
const NCRYPTSEC = "ncryptsec1qqqqq";
const NSEC = "nsec1qqqqq";

const mintBackup = vi.fn(async () => NCRYPTSEC);
const revealSecretKey = vi.fn(async () => NSEC);
const heldBackup = vi.fn((): string | undefined => NCRYPTSEC);
const activeDisplay = vi.fn(() => ({ npub: NPUB, displayName: "Lira Flint" }));

vi.mock("@/accounts/backup", () => ({
  mintBackup: (...args: unknown[]) => mintBackup(...(args as [])),
  revealSecretKey: (...args: unknown[]) => revealSecretKey(...(args as [])),
  heldBackup: () => heldBackup(),
}));
vi.mock("@/accounts/display", () => ({ activeDisplay: () => activeDisplay() }));

/** Filenames of the anchors the download path clicked. jsdom has no downloads. */
let downloads: string[] = [];

beforeEach(() => {
  downloads = [];
  mintBackup.mockClear();
  revealSecretKey.mockClear();
  heldBackup.mockClear();
  // jsdom implements neither, so they are assigned rather than spied on.
  URL.createObjectURL = () => "blob:fake";
  URL.revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the encrypted backup credential", () => {
  it("pairs the account's npub with a freshly minted Backup", async () => {
    await expect(getEncryptedBackupCredential("hunter2hunter2")).resolves.toEqual({
      npub: NPUB,
      ncryptsec: NCRYPTSEC,
    });
    expect(mintBackup).toHaveBeenCalledWith("hunter2hunter2");
  });
});

describe("downloading the encrypted backup", () => {
  it("mints once and hands the credential back, so storing it can't re-mint", async () => {
    const credential = await downloadAccountBackup("hunter2hunter2");

    expect(credential).toEqual({ npub: NPUB, ncryptsec: NCRYPTSEC });
    expect(mintBackup).toHaveBeenCalledTimes(1);
    expect(downloads).toHaveLength(1);
  });

  it("names the file after the account", async () => {
    await downloadAccountBackup("hunter2hunter2");

    expect(downloads[0]).toBe("brainstorm-account-backup-lira-flint.txt");
  });

  it("fails rather than downloading an empty file when the key can't be reached", async () => {
    mintBackup.mockRejectedValueOnce(new Error("locked"));

    await expect(downloadAccountBackup("hunter2hunter2")).rejects.toThrow("locked");
    expect(downloads).toHaveLength(0);
  });
});

describe("the Backup the account already holds", () => {
  it("pairs the stored ncryptsec with the npub, minting nothing", () => {
    expect(heldBackupCredential()).toEqual({ npub: NPUB, ncryptsec: NCRYPTSEC });
    expect(mintBackup).not.toHaveBeenCalled();
  });

  it("is nothing when the account has no Backup yet", () => {
    heldBackup.mockReturnValueOnce(undefined);

    expect(heldBackupCredential()).toBeNull();
  });

  it("downloads that credential as the file, without a second derivation", () => {
    downloadBackupFile({ npub: NPUB, ncryptsec: NCRYPTSEC });

    expect(downloads[0]).toBe("brainstorm-account-backup-lira-flint.txt");
    expect(mintBackup).not.toHaveBeenCalled();
  });
});

describe("downloading the raw key", () => {
  it("reveals the key and names the file after the account", async () => {
    await downloadRawKeyBackup();

    expect(revealSecretKey).toHaveBeenCalledTimes(1);
    expect(downloads[0]).toBe("brainstorm-account-key-lira-flint.txt");
  });

  it("fails rather than downloading an empty file when the key can't be reached", async () => {
    revealSecretKey.mockRejectedValueOnce(new Error("locked"));

    await expect(downloadRawKeyBackup()).rejects.toThrow("locked");
    expect(downloads).toHaveLength(0);
  });
});

describe("the backup file", () => {
  it("still prints the frozen restore instruction every old file carries", () => {
    const content = buildAccountBackupFileContent(NCRYPTSEC, NPUB);

    expect(content).toContain('"Use your key"');
    expect(content).toContain(NCRYPTSEC);
    expect(content).toContain(NPUB);
  });

  it("no longer claims the password was chosen at backup time — it's set at signup", () => {
    const content = buildAccountBackupFileContent(NCRYPTSEC, NPUB);

    expect(content).not.toContain("when you saved this backup");
    expect(content).toContain("recovery password");
  });
});
