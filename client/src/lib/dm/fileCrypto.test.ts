// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptFile, encryptFile, fileTags, matchesHash } from "./fileCrypto";

describe("file message encryption", () => {
  it("round-trips a file and describes it in kind-15 tags", async () => {
    const plain = new TextEncoder().encode("a private attachment");
    const enc = await encryptFile(plain);
    expect(enc.keyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(enc.nonceHex).toMatch(/^[0-9a-f]{24}$/);
    expect(await matchesHash(enc.cipher, enc.hash)).toBe(true);
    expect(new TextDecoder().decode(await decryptFile(enc.cipher, enc.keyHex, enc.nonceHex))).toBe(
      "a private attachment",
    );

    const tags = fileTags({ type: "text/plain", size: plain.length }, enc);
    expect(tags).toContainEqual(["encryption-algorithm", "aes-gcm"]);
    expect(tags).toContainEqual(["decryption-key", enc.keyHex]);
  });

  it("rejects a tampered download", async () => {
    const enc = await encryptFile(new Uint8Array([1, 2, 3]));
    const tampered = new Uint8Array(enc.cipher);
    tampered[0] ^= 1;
    expect(await matchesHash(tampered, enc.hash)).toBe(false);
    await expect(decryptFile(tampered, enc.keyHex, enc.nonceHex)).rejects.toThrow();
  });
});
