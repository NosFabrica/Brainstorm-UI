/**
 * Nostash (Safari NIP-07 signer, iOS and macOS) for tests — its background.js as read
 * in tyiu/nostash@9f37c63 and measured on 2.1 in the iOS simulator:
 *   - a decrypt that fails (spam, a corrupt wrap, another key's) is never answered:
 *     `nip44Decrypt(...).then(sendResponse)` has no catch, and the page's promise no
 *     reject (https://github.com/tyiu/nostash/issues/1);
 *   - the reply callback lives in one shared variable (`sendResponse = …`, undeclared),
 *     so requests in flight together get each other's answers.
 * Test-only; not imported by the app.
 */
import { getPublicKey, nip44 } from "nostr-tools";

export interface NostashOptions {
  /** Ciphertexts answered only after `slowMs` (a busy extension). */
  slow?: Set<string>;
  slowMs?: number;
  /** Requests lost whole (Safari unloading the extension mid-request): never answered, whatever they were. */
  lose?: () => boolean;
}

export function fakeNostash(sk: Uint8Array, { slow = new Set(), slowMs = 0, lose = () => false }: NostashOptions = {}) {
  const me = getPublicKey(sk);
  let sendResponse: (v: unknown) => void = () => {}; // Nostash's shared reply slot
  const storage = () => new Promise((r) => setTimeout(r, 1)); // browser.storage.local.get
  const calls = { decrypt: 0, encrypt: 0 };
  const background = async (
    kind: string,
    payload: { pubKey: string; cipherText?: string; plainText?: string },
    reply: (v: unknown) => void,
  ) => {
    await storage(); // getPermission: already "allow"
    if (lose()) return;
    sendResponse = reply; // complete(): `sendResponse = validations[payload]`
    const run = async () => {
      await storage(); // getPrivKey
      if (payload.cipherText && slow.has(payload.cipherText)) await new Promise((r) => setTimeout(r, slowMs));
      const key = nip44.getConversationKey(sk, payload.pubKey);
      return kind === "nip44.decrypt"
        ? nip44.decrypt(payload.cipherText!, key)
        : nip44.encrypt(payload.plainText!, key);
    };
    // A failure is never answered (in Nostash, an unhandled rejection).
    run().then(
      (v) => sendResponse(v),
      () => {},
    );
  };
  const broadcast = (kind: string, payload: never) => new Promise((resolve) => void background(kind, payload, resolve));
  const nostr = {
    getPublicKey: async () => me,
    signEvent: async () => undefined,
    nip44: {
      encrypt: (pubKey: string, plainText: string) => {
        calls.encrypt++;
        return broadcast("nip44.encrypt", { pubKey, plainText } as never);
      },
      decrypt: (pubKey: string, cipherText: string) => {
        calls.decrypt++;
        return broadcast("nip44.decrypt", { pubKey, cipherText } as never);
      },
    },
  };
  return { nostr, calls };
}

/**
 * navigator.locks as tabs share it: one holder per name at a time, granted in order;
 * `signal` aborts a wait (rejecting with the signal's reason, as browsers do).
 */
export function fakeLockManager() {
  const tails = new Map<string, Promise<unknown>>();
  const request = (
    name: string,
    optsOrCb: { signal?: AbortSignal } | (() => Promise<unknown>),
    maybeCb?: () => Promise<unknown>,
  ) => {
    const cb = (typeof optsOrCb === "function" ? optsOrCb : maybeCb)!;
    const signal = typeof optsOrCb === "function" ? undefined : optsOrCb.signal;
    const prev = tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    tails.set(
      name,
      prev.then(() => held),
    );
    return new Promise((resolve, reject) => {
      let granted = false;
      signal?.addEventListener("abort", () => {
        if (granted) return;
        reject(signal.reason);
        // Our turn is skipped: whoever is behind us may go once the one ahead is done.
        void prev.then(release);
      });
      void prev.then(() => {
        if (signal?.aborted) return;
        granted = true;
        Promise.resolve().then(cb).then(resolve, reject).finally(release);
      });
    });
  };
  return { request };
}
