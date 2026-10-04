// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { EventTemplate } from "nostr-tools";

import {
  BrainstormExtensionAccount,
  EXTENSION_TIMEOUT_MS,
  ExtensionDeclinedError,
  TimedExtensionSigner,
} from "./extension";
import { isRemoteSignerTimeout } from "./remote-signer";
import { signerSaidNo } from "./signing";

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
    expect(error).toBeInstanceOf(ExtensionDeclinedError);
    expect(signerSaidNo(error)).toBe(true);
  });

  it("throws a declined error for a declined login", async () => {
    install({ getPublicKey: async () => undefined });
    await expect(new TimedExtensionSigner().getPublicKey()).rejects.toBeInstanceOf(ExtensionDeclinedError);
    await expect(BrainstormExtensionAccount.fromExtension()).rejects.toBeInstanceOf(ExtensionDeclinedError);
  });

  it("throws a declined error for a declined decrypt, never handing `undefined` on", async () => {
    install({ nip44: { encrypt: async () => undefined, decrypt: async () => undefined } });
    const signer = new TimedExtensionSigner();
    await expect(signer.nip44!.decrypt(pubkey, "x")).rejects.toBeInstanceOf(ExtensionDeclinedError);
    await expect(signer.nip44!.encrypt(pubkey, "x")).rejects.toBeInstanceOf(ExtensionDeclinedError);
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
