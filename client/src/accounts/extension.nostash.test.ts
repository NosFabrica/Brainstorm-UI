// @vitest-environment node
/**
 * Nostash (Safari, iOS and macOS), as measured on 2.1 in the iOS simulator and read
 * in its background.js:
 *   - a decrypt that fails (spam, a corrupt wrap, another key's) is never answered:
 *     `nip44Decrypt(...).then(sendResponse)` has no catch, and the page's promise has
 *     no reject;
 *   - the reply callback lives in one shared variable (`sendResponse = …`, undeclared),
 *     so requests in flight together get each other's answers.
 * The fake below does both, the same way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey, nip44 } from "nostr-tools";

import { EXTENSION_DECRYPT_MS, TimedExtensionSigner } from "./extension";
import { classifySignerError } from "./signer-errors";

const sk = generateSecretKey();
const me = getPublicKey(sk);
const seal = (text: string) => nip44.encrypt(text, nip44.getConversationKey(sk, me));

/** Nostash's background page: storage is async; the mutex is let go once a request starts. */
function nostash({ slowMs = 0, slow = new Set<string>() } = {}) {
  let sendResponse: (v: unknown) => void = () => {}; // Nostash's shared reply slot
  const storage = () => new Promise((r) => setTimeout(r, 1)); // browser.storage.local.get
  const background = async (
    kind: string,
    payload: { pubKey: string; cipherText?: string; plainText?: string },
    reply: (v: unknown) => void,
  ) => {
    await storage(); // getPermission: already "allow"
    sendResponse = reply; // complete(): `sendResponse = validations[payload]`
    const run = async () => {
      await storage(); // getPrivKey
      if (payload.cipherText && slow.has(payload.cipherText)) await new Promise((r) => setTimeout(r, slowMs));
      const key = nip44.getConversationKey(sk, payload.pubKey);
      return kind === "nip44.decrypt"
        ? nip44.decrypt(payload.cipherText!, key)
        : nip44.encrypt(payload.plainText!, key);
    };
    run().then(
      (v) => sendResponse(v),
      () => {},
    ); // a failure is never answered (Nostash: an unhandled rejection)
  };
  const broadcast = (kind: string, payload: never) => new Promise((resolve) => void background(kind, payload, resolve));
  const nostr = {
    getPublicKey: async () => me,
    signEvent: async () => undefined,
    nip44: {
      encrypt: (pubKey: string, plainText: string) => broadcast("nip44.encrypt", { pubKey, plainText } as never),
      decrypt: (pubKey: string, cipherText: string) => broadcast("nip44.decrypt", { pubKey, cipherText } as never),
    },
  };
  (globalThis as { window?: unknown }).window = { nostr };
  return nostr;
}

/** navigator.locks, shared by "tabs": one holder per name at a time. */
function lockManager() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, cb: () => Promise<unknown>) => {
      const run = (tails.get(name) ?? Promise.resolve()).then(cb);
      tails.set(
        name,
        run.catch(() => {}),
      );
      return run;
    },
  };
}

function signer() {
  const s = new TimedExtensionSigner();
  s.owner = me;
  return s;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (globalThis as { window?: unknown }).window;
});

describe("Nostash: a decrypt it never answers", () => {
  it("is called unreadable once it outlasts the decrypt deadline, and the next message opens", async () => {
    nostash();
    const s = signer();
    expect(await s.nip44!.decrypt(me, seal("hello"))).toBe("hello"); // answered in a blink
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const started = Date.now();
    const stuck = s.nip44!.decrypt(me, "AnotAValidCiphertext").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(EXTENSION_DECRYPT_MS + 1_000);
    expect(classifySignerError(await stuck)).toBe("bad-payload");
    expect(Date.now() - started).toBeLessThan(60_000); // not the 90s extension timeout
    expect(await s.nip44!.decrypt(me, seal("next"))).toBe("next");
  });

  it("is waited for when nothing has been answered quickly yet — a prompt may be open", async () => {
    nostash();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const s = signer();
    let error: unknown;
    void s.nip44!.decrypt(me, "AnotAValidCiphertext").catch((e: unknown) => (error = e));
    await vi.advanceTimersByTimeAsync(EXTENSION_DECRYPT_MS + 1_000);
    expect(classifySignerError(error)).toBe("timeout"); // not blamed on the message
  });

  it("waits out a slow answer instead of letting the next request cross it", async () => {
    const slowOne = seal("slow");
    nostash({ slowMs: 12_000, slow: new Set([slowOne]) });
    vi.stubGlobal("navigator", { locks: lockManager() });
    const s = signer();
    expect(await s.nip44!.decrypt(me, seal("warm"))).toBe("warm");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const a = s.nip44!.decrypt(me, slowOne);
    const b = s.nip44!.decrypt(me, seal("quick"));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await a).toBe("slow");
    expect(await b).toBe("quick");
  });
});

describe("Nostash: requests in flight together", () => {
  const burst = async (tabs: TimedExtensionSigner[]) => {
    const texts = Array.from({ length: 8 }, (_, i) => `msg-${i}`);
    const ciphers = texts.map(seal);
    const answers = await Promise.all(
      ciphers.map((c, i) =>
        Promise.race([
          tabs[i % tabs.length].nip44!.decrypt(me, c),
          new Promise((r) => setTimeout(() => r("<none>"), 200)),
        ]),
      ),
    );
    return answers.map((a, i) => (a === texts[i] ? null : `${i}:${String(a)}`)).filter(Boolean);
  };

  it("cross their answers in Nostash itself (the fake is faithful)", async () => {
    const nostr = nostash();
    const texts = Array.from({ length: 8 }, (_, i) => `msg-${i}`);
    const answers = await Promise.all(
      texts.map((t) =>
        Promise.race([nostr.nip44.decrypt(me, seal(t)), new Promise((r) => setTimeout(() => r("<none>"), 200))]),
      ),
    );
    expect(answers).not.toEqual(texts);
  });

  it("never cross from two Brainstorm tabs: the extension is asked one request at a time", async () => {
    nostash();
    vi.stubGlobal("navigator", { locks: lockManager() });
    expect(await burst([signer(), signer()])).toEqual([]);
  });
});
