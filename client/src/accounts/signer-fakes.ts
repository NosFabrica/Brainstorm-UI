/**
 * NIP-07 extensions, in memory — one per way a real one behaves.
 *
 * NIP-07 says what to call and nothing about how a refusal, a closed prompt or
 * a missing method looks, so every extension answers those differently. Each
 * behaviour here is one a shipping extension has; the conformance suite
 * (`signer-conformance.test.ts`) runs every flow that asks a signer against all
 * of them, so the next extension that does something new fails a test rather
 * than losing someone's messages.
 */
import { nip44 } from "nostr-tools";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { EventTemplate } from "nostr-tools";

export type ExtensionBehaviour =
  /** Answers everything. */
  | "works"
  /** nos2x, Alby: a declined prompt rejects. */
  | "rejects"
  /** Nostash, Nostore: a declined prompt resolves `undefined`. */
  | "answers-nothing"
  /** Nostash with its prompt tab closed unanswered, or failing inside: never settles. */
  | "never-answers"
  /** An extension without NIP-44: signs, can't encrypt. */
  | "no-nip44"
  /** Switched to another profile since sign-in: signs as someone else. */
  | "switched-profile";

export type FakeExtension = {
  /** The identity the account was signed in as. */
  pubkey: string;
  /** Its secret key, to build what a counterparty would send. */
  secretKey: Uint8Array;
  /** Calls made, by method, to tell "asked" from "never asked". */
  calls: string[];
};

const never = () => new Promise<never>(() => {});

/**
 * Install `window.nostr` behaving as `behaviour`. `after` delays it, as a slow
 * extension injects; `secretKey` brings back the same identity.
 */
export function installExtension(
  behaviour: ExtensionBehaviour,
  { after, secretKey = generateSecretKey() }: { after?: number; secretKey?: Uint8Array } = {},
): FakeExtension {
  const pubkey = getPublicKey(secretKey);
  // The key it actually signs with: another profile's, once switched.
  const signingKey = behaviour === "switched-profile" ? generateSecretKey() : secretKey;
  const calls: string[] = [];

  const answer = <T>(method: string, work: () => T): Promise<T> => {
    calls.push(method);
    if (behaviour === "rejects") return Promise.reject(new Error("User rejected the request"));
    if (behaviour === "answers-nothing") return Promise.resolve(undefined as T);
    if (behaviour === "never-answers") return never();
    return Promise.resolve().then(work);
  };
  const conversation = (counterparty: string) => nip44.getConversationKey(signingKey, counterparty);

  const nostr = {
    // Asked at sign-in, before any profile switch.
    getPublicKey: () => answer("getPublicKey", () => pubkey),
    signEvent: (template: EventTemplate) => answer("signEvent", () => finalizeEvent(template, signingKey)),
    nip44:
      behaviour === "no-nip44"
        ? undefined
        : {
            encrypt: (to: string, plaintext: string) =>
              answer("nip44.encrypt", () => nip44.encrypt(plaintext, conversation(to))),
            decrypt: (from: string, ciphertext: string) =>
              answer("nip44.decrypt", () => nip44.decrypt(ciphertext, conversation(from))),
          },
  };

  const win = ((globalThis as unknown as { window?: Record<string, unknown> }).window ??= {} as Record<
    string,
    unknown
  >);
  if (after === undefined) win.nostr = nostr;
  else setTimeout(() => (win.nostr = nostr), after);
  return { pubkey, secretKey, calls };
}

/** No extension at all. */
export function removeExtension(): void {
  const win = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  if (win) delete win.nostr;
}
