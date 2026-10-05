/**
 * A NIP-07 browser extension, held to two promises the spec doesn't make.
 *
 * **A "no" is an error.** nos2x and Alby reject a declined request; Nostash and
 * Nostore (Safari, iOS and macOS) resolve it with `undefined`. The library takes
 * that for an answer: a declined login or signature surfaced as a TypeError from
 * verifying `undefined`, which nothing could tell from a fault — relay sign-in
 * filed it as "didn't go through" and asked again — and a declined decrypt handed
 * `undefined` to the gift-wrap parser, which remembered the message as unreadable
 * for good. Here every empty answer is a `SignerDeclinedError`.
 *
 * **Every request ends.** Nostash answers only allow and deny: close its prompt tab
 * without choosing, or let it fail inside (a bad MAC, the wrong profile selected),
 * and the request never settles. The Account runs signer requests one at a time,
 * so that one request held every later one — sends, decrypts, logins — until a
 * reload. The deadline is generous, as for the login challenge, because a person
 * may be unlocking the extension; the point is only that it ends.
 */
import { ExtensionAccount } from "applesauce-accounts/accounts";
import type { SerializedAccount } from "applesauce-accounts";
import { isHexKey } from "applesauce-core/helpers";
import { verifyEvent, type EventTemplate, type VerifiedEvent } from "applesauce-core/helpers/event";
import { ExtensionMissingError, ExtensionSigner } from "applesauce-signers";

import type { AccountMetadata } from "./metadata";
import { withTimeout } from "./remote-signer";
import { SignerDeclinedError } from "./signer-errors";

export const EXTENSION_TIMEOUT_MS = 90_000;

const LATE = "Your signer extension didn't answer. Open it and check for a request waiting there.";

const declined = () => new SignerDeclinedError("Your signer extension declined the request.");

type Cipher = {
  encrypt(pubkey: string, plaintext: string): Promise<unknown>;
  decrypt(pubkey: string, ciphertext: string): Promise<unknown>;
};
type Nip07 = {
  getPublicKey(): Promise<unknown>;
  signEvent(template: EventTemplate): Promise<unknown>;
  nip04?: Cipher;
  nip44?: Cipher;
};

function extension(): Nip07 {
  const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
  if (!nostr) throw new ExtensionMissingError("Signer extension missing");
  return nostr;
}

const answered = <T>(value: T): NonNullable<T> => {
  if (value === undefined || value === null) throw declined();
  return value as NonNullable<T>;
};

/** A cipher's answer is a string, or it is no answer — `""` is a real plaintext. */
async function text(request: () => Promise<unknown>): Promise<string> {
  const result = await withTimeout(Promise.resolve().then(request), EXTENSION_TIMEOUT_MS, LATE);
  if (typeof result !== "string") throw declined();
  return result;
}

/**
 * Absent only when the extension is here and lacks it. An extension that hasn't
 * injected yet may well have it — Nostash injects through a script tag, often
 * after the DM engine has started — so that is asked when called, and fails as
 * "missing" (try again later) rather than "can't" (pause for good).
 */
function timedCipher(pick: (nostr: Nip07) => Cipher | undefined) {
  const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
  if (nostr && !pick(nostr)) return undefined;
  const cipher = () => {
    const found = pick(extension());
    if (!found) throw new Error("Your signer extension can't encrypt (no NIP-44).");
    return found;
  };
  return {
    encrypt: (pubkey: string, plaintext: string) => text(() => cipher().encrypt(pubkey, plaintext)),
    decrypt: (pubkey: string, ciphertext: string) => text(() => cipher().decrypt(pubkey, ciphertext)),
  };
}

/** The library's signer, with a deadline on every request and a declined one thrown. */
export class TimedExtensionSigner extends ExtensionSigner {
  get nip04() {
    return timedCipher((nostr) => nostr.nip04);
  }
  get nip44() {
    return timedCipher((nostr) => nostr.nip44);
  }

  async getPublicKey(): Promise<string> {
    const nostr = extension();
    if (this.pubkey) return this.pubkey;
    const key = answered(await withTimeout(nostr.getPublicKey(), EXTENSION_TIMEOUT_MS, LATE));
    if (typeof key !== "string" || !isHexKey(key)) throw new Error("Extension returned an invalid public key");
    this.pubkey = key;
    return key;
  }

  async signEvent(template: EventTemplate): Promise<VerifiedEvent> {
    const event = answered(await withTimeout(extension().signEvent(template), EXTENSION_TIMEOUT_MS, LATE));
    if (!verifyEvent(event as VerifiedEvent)) throw new Error("Extension returned an invalid event");
    return event as VerifiedEvent;
  }
}

/**
 * The Account behind an extension, so a *restored* one gets the same signer — the
 * library's `fromJSON` builds a bare one. The serialised form and the type string
 * are the library's own, so rows saved before this read back unchanged.
 */
export class BrainstormExtensionAccount<Metadata = AccountMetadata> extends ExtensionAccount<Metadata> {
  constructor(pubkey: string, signer: ExtensionSigner = new TimedExtensionSigner()) {
    super(pubkey, signer);
  }

  static fromJSON<Metadata = AccountMetadata>(
    json: SerializedAccount<void, Metadata>,
  ): BrainstormExtensionAccount<Metadata> {
    const account = new BrainstormExtensionAccount<Metadata>(json.pubkey);
    return super.loadCommonFields(account, json) as BrainstormExtensionAccount<Metadata>;
  }

  /** Asks the extension for its pubkey — so this both waits for it and proves it will answer. */
  static async fromExtension<Metadata = AccountMetadata>(): Promise<BrainstormExtensionAccount<Metadata>> {
    const signer = new TimedExtensionSigner();
    return new BrainstormExtensionAccount<Metadata>(await signer.getPublicKey(), signer);
  }
}
