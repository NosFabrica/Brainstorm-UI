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

import { SILENT_DECRYPT_MS, TimedExtensionSigner } from "./extension";
import { classifySignerError } from "./signer-errors";

const sk = generateSecretKey();
const me = getPublicKey(sk);
const seal = (text: string) => nip44.encrypt(text, nip44.getConversationKey(sk, me));

/** Nostash's background page: storage is async; the mutex is let go once a request starts. */
function nostash() {
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
  it("is called unreadable after a few seconds of silence, and the next message opens at once", async () => {
    nostash();
    const s = signer();
    expect(await s.nip44!.decrypt(me, seal("hello"))).toBe("hello"); // answered in a blink
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const started = Date.now();
    const stuck = s.nip44!.decrypt(me, "AnotAValidCiphertext").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SILENT_DECRYPT_MS + 1_000);
    const error = await stuck;
    expect(classifySignerError(error)).toBe("bad-payload");
    expect(Date.now() - started).toBeLessThan(15_000); // not the 90s timeout
    expect(await s.nip44!.decrypt(me, seal("next"))).toBe("next");
  });

  it("is waited for when nothing has been answered quickly yet — a prompt may be open", async () => {
    nostash();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const s = signer();
    let settled = false;
    void s.nip44!.decrypt(me, "AnotAValidCiphertext").catch(() => (settled = true));
    await vi.advanceTimersByTimeAsync(SILENT_DECRYPT_MS * 3);
    expect(settled).toBe(false);
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
