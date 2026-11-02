// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";

vi.mock("./passkey", async (original) => ({
  ...(await original<typeof import("./passkey")>()),
  assertPasskey: vi.fn(),
}));

import {
  aaguidOf,
  assertPasskey,
  credentialIdHash,
  deviceName,
  fromB64url,
  openSealedKey,
  parseSealedKey,
  PasskeyMismatchError,
  passkeyMethod,
  providerName,
  sealKey,
  toB64url,
} from "./passkey";
import { LocalSigner, NoUnlockPathError, type RecoveryPasswordRequest } from "./local-signer";
import { createFakeUnlockCache } from "./test-fakes";

const PRF = new Uint8Array(32).fill(7);
const OTHER_PRF = new Uint8Array(32).fill(8);
const CREDENTIAL = toB64url(new TextEncoder().encode("credential-1"));

function keypair() {
  const key = generateSecretKey();
  return { key, pubkey: getPublicKey(key) };
}

afterEach(() => vi.mocked(assertPasskey).mockReset());

describe("the passkey seal", () => {
  it("opens with the PRF output it was sealed under", async () => {
    const { key, pubkey } = keypair();
    const sealed = await sealKey(key, pubkey, CREDENTIAL, PRF);

    expect(sealed).toMatchObject({ v: 1, pubkey, credentialId: CREDENTIAL });
    expect(await openSealedKey(sealed, PRF)).toEqual(key);
  });

  it("fails closed for another passkey's PRF output", async () => {
    const { key, pubkey } = keypair();
    const sealed = await sealKey(key, pubkey, CREDENTIAL, PRF);

    await expect(openSealedKey(sealed, OTHER_PRF)).rejects.toBeInstanceOf(PasskeyMismatchError);
  });

  it("binds the seal to its pubkey and credential, so neither can be swapped", async () => {
    const { key, pubkey } = keypair();
    const sealed = await sealKey(key, pubkey, CREDENTIAL, PRF);

    await expect(openSealedKey({ ...sealed, pubkey: keypair().pubkey }, PRF)).rejects.toBeInstanceOf(
      PasskeyMismatchError,
    );
    await expect(openSealedKey({ ...sealed, credentialId: "b3RoZXI" }, PRF)).rejects.toBeInstanceOf(
      PasskeyMismatchError,
    );
  });

  it("round-trips through the server's blob unchanged", async () => {
    const { key, pubkey } = keypair();
    const sealed = await sealKey(key, pubkey, CREDENTIAL, PRF);

    const parsed = parseSealedKey(JSON.stringify(sealed));
    expect(parsed).toEqual(sealed);
    expect(await openSealedKey(parsed!, PRF)).toEqual(key);
  });

  it("refuses a blob that isn't a v1 seal", () => {
    expect(parseSealedKey("not json")).toBeNull();
    expect(parseSealedKey(JSON.stringify({ v: 2 }))).toBeNull();
    expect(
      parseSealedKey(JSON.stringify({ v: 1, pubkey: "nope", credentialId: "a", iv: "b", ciphertext: "c" })),
    ).toBeNull();
  });
});

describe("encodings the server shares", () => {
  it("hashes a credential id the way the server keys its rows: sha256 of the raw id", async () => {
    expect(await credentialIdHash(CREDENTIAL)).toBe(createHash("sha256").update("credential-1").digest("hex"));
  });

  it("round-trips base64url without padding", () => {
    const bytes = new Uint8Array([251, 255, 0, 1, 2]);
    const encoded = toB64url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromB64url(encoded)).toEqual(bytes);
  });

  it("reads the AAGUID out of registration authenticator data", () => {
    const data = new Uint8Array(60);
    data.set([0xea, 0x9b, 0x8d, 0x66, 0x4d, 0x01, 0x1d, 0x21, 0x3c, 0xe4, 0xb6, 0xb4, 0x8c, 0xb5, 0x75, 0xd4], 37);
    const aaguid = aaguidOf(data.buffer);
    expect(aaguid).toBe("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4");
    expect(providerName(aaguid)).toBe("Google Password Manager");
    expect(providerName("00000000-0000-0000-0000-000000000000")).toBe("Passkey");
  });
});

describe("what a device calls a passkey", () => {
  it("names the method only where the device makes it a safe guess", () => {
    expect(passkeyMethod("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)").label).toBe("Face ID");
    expect(passkeyMethod("Mozilla/5.0 (Windows NT 10.0; Win64; x64)").label).toBe("Windows Hello");
    expect(passkeyMethod("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toEqual({
      label: "Passkey",
      withPhrase: "a passkey",
    });
  });

  it("says what the passkey was made on", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("Android");
  });
});

describe("LocalSigner with a passkey", () => {
  async function signerWithPasskey() {
    const { key, pubkey } = keypair();
    const unlockCache = createFakeUnlockCache();
    const seed = LocalSigner.fromKey(key, { unlockCache });
    const stored = await seed.addPasskey(CREDENTIAL, PRF, {
      provider: "iCloud Keychain",
      device: "iPhone",
      addedAt: 1,
    });
    return { key, pubkey, unlockCache, stored, data: { ...seed.data } };
  }

  it("keeps only a seal that reopens to its own key", async () => {
    const { pubkey, stored, data } = await signerWithPasskey();
    expect(data.passkeys).toEqual([stored]);
    expect(stored).toMatchObject({ pubkey, credentialId: CREDENTIAL, provider: "iCloud Keychain" });
  });

  it("offers the passkey from the unlock prompt when there is no password to ask for", async () => {
    const { pubkey, unlockCache, data } = await signerWithPasskey();
    vi.mocked(assertPasskey).mockResolvedValue({
      credentialId: CREDENTIAL,
      pubkey,
      prf: PRF,
      wire: { credentialId: CREDENTIAL, clientDataJSON: "", authenticatorData: "", signature: "" },
    });
    const requestPassword = vi.fn(async (request: RecoveryPasswordRequest) => {
      expect(request.hasPassword).toBe(false);
      await request.passkey!();
    });
    const signer = new LocalSigner(pubkey, data, { unlockCache, requestPassword });

    await signer.unlock();

    expect(signer.unlocked).toBe(true);
    expect(await signer.getPublicKey()).toBe(pubkey);
    expect(assertPasskey).toHaveBeenCalledWith({ credentialIds: [CREDENTIAL] });
  });

  it("refuses a passkey answer that isn't one of its own", async () => {
    const { pubkey, unlockCache, data } = await signerWithPasskey();
    vi.mocked(assertPasskey).mockResolvedValue({
      credentialId: "c29tZW9uZS1lbHNl",
      pubkey,
      prf: PRF,
      wire: { credentialId: "", clientDataJSON: "", authenticatorData: "", signature: "" },
    });
    const signer = new LocalSigner(pubkey, data, { unlockCache });

    await expect(signer.unlockWithPasskey()).rejects.toBeInstanceOf(PasskeyMismatchError);
    expect(signer.unlocked).toBe(false);
  });

  it("will not take a password for an account that has none", async () => {
    const { pubkey, unlockCache, data } = await signerWithPasskey();
    const signer = new LocalSigner(pubkey, data, { unlockCache });

    await expect(signer.unlock("anything")).rejects.toBeInstanceOf(NoUnlockPathError);
  });

  it("forgets the passkeys field once the last one goes", async () => {
    const { pubkey, unlockCache, data } = await signerWithPasskey();
    const signer = new LocalSigner(pubkey, data, { unlockCache });

    signer.removePasskey(CREDENTIAL);

    expect(signer.data.passkeys).toBeUndefined();
    expect(signer.hasPasskeys).toBe(false);
  });
});
