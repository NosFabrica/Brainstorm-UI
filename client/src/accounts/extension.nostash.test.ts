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

import {
  EXTENSION_DECRYPT_MS,
  EXTENSION_LOCK,
  EXTENSION_RETRY_DECRYPT_MS,
  LOCK_WAIT_MS,
  TimedExtensionSigner,
} from "./extension";
import { fakeLockManager, fakeNostash, type NostashOptions } from "./nostash-fake";
import { classifySignerError } from "./signer-errors";

const sk = generateSecretKey();
const me = getPublicKey(sk);
const seal = (text: string) => nip44.encrypt(text, nip44.getConversationKey(sk, me));

const nostash = (opts?: NostashOptions) => {
  const fake = fakeNostash(sk, opts);
  (globalThis as { window?: unknown }).window = { nostr: fake.nostr };
  return fake.nostr;
};
const lockManager = fakeLockManager;

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
    await vi.advanceTimersByTimeAsync(EXTENSION_DECRYPT_MS + EXTENSION_RETRY_DECRYPT_MS + 1_000);
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

describe("another tab holding the extension", () => {
  it("is waited for up to LOCK_WAIT_MS, then the request ends as worth asking again", async () => {
    nostash();
    const locks = lockManager();
    vi.stubGlobal("navigator", { locks });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A tab whose timers froze while it held the extension (iOS suspends background tabs).
    void locks.request(EXTENSION_LOCK, () => new Promise(() => {}));
    const asked = signer()
      .nip44!.decrypt(me, seal("hello"))
      .catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(LOCK_WAIT_MS + 1_000);
    const error = await asked;
    expect((error as Error).name).toBe("ExtensionBusyError");
    expect(classifySignerError(error)).toBe("timeout");
  });
});
