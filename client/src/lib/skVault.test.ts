// @vitest-environment jsdom
/**
 * The device-key wrap, against a real IndexedDB and real WebCrypto: the key
 * that unwraps the stored secret lives in IDB and is never readable by JS, so
 * these go through the actual store rather than a stand-in for it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { encryptSecret, decryptSecret, isVaultSupported } from "./skVault";

const secret = new Uint8Array(32).fill(7);
const pubkey = "b".repeat(64);
const other = "c".repeat(64);

beforeEach(() => {
  indexedDB = new IDBFactory();
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
});

describe("the device-key vault", () => {
  it("is available where IndexedDB and WebCrypto are", () => {
    expect(isVaultSupported()).toBe(true);
  });

  it("gives the secret back, through the key it kept on the device", async () => {
    const envelope = await encryptSecret(secret, pubkey);
    expect(envelope.startsWith("v1:")).toBe(true);
    expect(envelope).not.toContain("07070707");
    expect(await decryptSecret(envelope, pubkey)).toEqual(secret);
  });

  it("refuses an envelope minted for another account — it fails closed", async () => {
    const envelope = await encryptSecret(secret, pubkey);
    await expect(decryptSecret(envelope, other)).rejects.toBeTruthy();
  });

  it("uses the same device key across operations, so a second unlock still works", async () => {
    const first = await encryptSecret(secret, pubkey);
    const second = await encryptSecret(secret, pubkey);
    expect(first).not.toBe(second); // a fresh iv each time
    expect(await decryptSecret(first, pubkey)).toEqual(secret);
    expect(await decryptSecret(second, pubkey)).toEqual(secret);
  });
});
