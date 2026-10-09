// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { EventTemplate } from "nostr-tools";
import { SignerMismatchError } from "applesauce-accounts";

import { BrainstormExtensionAccount, EXTENSION_TIMEOUT_MS, TimedExtensionSigner } from "./extension";
import { isRemoteSignerTimeout } from "./remote-signer";
import { classifySignerError, SignerDeclinedError, signerSaidNo } from "./signer-errors";

const sk = generateSecretKey();
const pubkey = getPublicKey(sk);
const template: EventTemplate = { kind: 1, tags: [], content: "hi", created_at: 1 };

/** An extension shaped like Nostash: a declined request resolves `undefined`. */
function install(overrides: Record<string, unknown> = {}) {
  const nostr = {
    getPublicKey: vi.fn(async () => pubkey),
    signEvent: vi.fn(async (t: EventTemplate) => finalizeEvent(t, sk)),
    nip44: {
      encrypt: vi.fn(async () => "ciphertext"),
      decrypt: vi.fn(async () => "plaintext"),
    },
    ...overrides,
  };
  (globalThis as { window?: unknown }).window = { nostr };
  return nostr;
}

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { window?: unknown }).window;
});

describe("TimedExtensionSigner", () => {
  it("passes a real answer through", async () => {
    install();
    const signer = new TimedExtensionSigner();
    expect(await signer.getPublicKey()).toBe(pubkey);
    expect((await signer.signEvent(template)).pubkey).toBe(pubkey);
    expect(await signer.nip44!.decrypt(pubkey, "x")).toBe("plaintext");
  });

  it("keeps an empty plaintext — it is an answer, not a refusal", async () => {
    install({ nip44: { encrypt: async () => "c", decrypt: async () => "" } });
    expect(await new TimedExtensionSigner().nip44!.decrypt(pubkey, "x")).toBe("");
  });

  it("throws a declined error, which reads as the signer saying no, for a declined signature", async () => {
    install({ signEvent: async () => undefined });
    const error = await new TimedExtensionSigner().signEvent(template).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignerDeclinedError);
    expect(signerSaidNo(error)).toBe(true);
  });

  it("throws a declined error for a declined login", async () => {
    install({ getPublicKey: async () => undefined });
    await expect(new TimedExtensionSigner().getPublicKey()).rejects.toBeInstanceOf(SignerDeclinedError);
    await expect(BrainstormExtensionAccount.fromExtension()).rejects.toBeInstanceOf(SignerDeclinedError);
  });

  it("throws a declined error for a declined decrypt, never handing `undefined` on", async () => {
    install({ nip44: { encrypt: async () => undefined, decrypt: async () => undefined } });
    const signer = new TimedExtensionSigner();
    await expect(signer.nip44!.decrypt(pubkey, "x")).rejects.toBeInstanceOf(SignerDeclinedError);
    await expect(signer.nip44!.encrypt(pubkey, "x")).rejects.toBeInstanceOf(SignerDeclinedError);
  });

  it("blames the message, not the signer, when it opens our own test but not this (Alby)", async () => {
    // Alby resolves `undefined` for a ciphertext it can't open, and opens anything else.
    const nostr = install({
      nip44: {
        encrypt: vi.fn(async (_: string, plaintext: string) => `sealed:${plaintext}`),
        decrypt: vi.fn(async (_: string, ciphertext: string) =>
          ciphertext.startsWith("sealed:") ? ciphertext.slice(7) : undefined,
        ),
      },
    });
    const signer = new TimedExtensionSigner();
    signer.owner = pubkey;

    const errors = await Promise.all(
      ["spam1", "spam2", "spam3"].map((c) => signer.nip44!.decrypt(pubkey, c).catch((e: unknown) => e)),
    );

    for (const error of errors) {
      expect(classifySignerError(error)).toBe("bad-payload");
      expect(signerSaidNo(error)).toBe(false);
    }
    // One test message covers the whole run.
    expect(nostr.nip44.encrypt).toHaveBeenCalledTimes(1);
  });

  it("still finds a wrong profile behind an empty decrypt", async () => {
    install({
      getPublicKey: async () => getPublicKey(generateSecretKey()),
      nip44: {
        encrypt: async (_: string, plaintext: string) => `sealed:${plaintext}`,
        decrypt: async (_: string, ciphertext: string) =>
          ciphertext.startsWith("sealed:") ? ciphertext.slice(7) : undefined,
      },
    });
    const signer = new TimedExtensionSigner();
    signer.owner = pubkey;
    await expect(signer.nip44!.decrypt(pubkey, "x")).rejects.toBeInstanceOf(SignerMismatchError);
  });

  it("has no nip44 when the extension has none", () => {
    install({ nip44: undefined });
    expect(new TimedExtensionSigner().nip44).toBeUndefined();
  });

  it("gives up on a request the extension never answers", async () => {
    vi.useFakeTimers();
    install({ signEvent: () => new Promise(() => {}) });
    const pending = new TimedExtensionSigner().signEvent(template).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(EXTENSION_TIMEOUT_MS);
    const error = await pending;
    expect(isRemoteSignerTimeout(error)).toBe(true);
    expect(signerSaidNo(error)).toBe(false);
  });
});

describe("BrainstormExtensionAccount", () => {
  it("lets later requests through once one the extension dropped times out", async () => {
    vi.useFakeTimers();
    const nostr = install();
    nostr.nip44.decrypt.mockImplementationOnce(() => new Promise(() => {}));
    const account = new BrainstormExtensionAccount(pubkey);

    const dropped = account.nip44!.decrypt(pubkey, "x").catch((e: unknown) => e);
    const next = account.signEvent(template);
    await vi.advanceTimersByTimeAsync(EXTENSION_TIMEOUT_MS);

    expect(isRemoteSignerTimeout(await dropped)).toBe(true);
    expect((await next).pubkey).toBe(pubkey);
  });

  it("restores with the same signer, under the library's own type string", () => {
    install();
    const saved = new BrainstormExtensionAccount(pubkey).toJSON();
    expect(saved.type).toBe("extension");
    const restored = BrainstormExtensionAccount.fromJSON(saved);
    expect(restored).toBeInstanceOf(BrainstormExtensionAccount);
    expect(restored.signer).toBeInstanceOf(TimedExtensionSigner);
    expect(restored.pubkey).toBe(pubkey);
  });
});

describe("confirmProfile", () => {
  it("asks once while a slow answer is pending, and that answer covers the run after it", async () => {
    vi.useFakeTimers();
    // The reader takes 40s to unlock the extension: longer than the 30s a confirmation stands.
    const nostr = install({ getPublicKey: vi.fn(() => new Promise((ok) => setTimeout(() => ok(pubkey), 40_000))) });
    const signer = new TimedExtensionSigner();
    signer.owner = pubkey;

    const first = signer.confirmProfile();
    await vi.advanceTimersByTimeAsync(35_000);
    const during = signer.confirmProfile();
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all([first, during]);
    await signer.confirmProfile();

    expect(nostr.getPublicKey).toHaveBeenCalledTimes(1);
  });

  it("asks again once a failed confirmation is past, rather than keeping the failure", async () => {
    const nostr = install({ getPublicKey: vi.fn(async () => undefined) });
    const signer = new TimedExtensionSigner();
    signer.owner = pubkey;
    await expect(signer.confirmProfile()).rejects.toBeInstanceOf(SignerDeclinedError);
    nostr.getPublicKey.mockImplementation(async () => pubkey);
    await expect(signer.confirmProfile()).resolves.toBeUndefined();
    expect(nostr.getPublicKey).toHaveBeenCalledTimes(2);
  });
});
