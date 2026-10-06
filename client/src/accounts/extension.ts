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
 *
 * **An empty decrypt is not always a "no".** Alby resolves `undefined` for a
 * ciphertext it can't open — one spam wrap read as a refusal and held the whole
 * inbox shut. An empty decrypt is followed by a round trip of our own
 * (`confirmCipher`): if the signer opens that, the message is what failed.
 *
 * **A wrong profile is not a broken message.** An extension switched to another
 * profile decrypts with that profile's key, and the failure looks exactly like a
 * corrupt ciphertext. Before a decrypt failure is blamed on the message, the
 * extension is asked who it is now (`confirmProfile`).
 */
import { ExtensionAccount } from "applesauce-accounts/accounts";
import { SignerMismatchError, type SerializedAccount } from "applesauce-accounts";
import { isHexKey } from "applesauce-core/helpers";
import { verifyEvent, type EventTemplate, type VerifiedEvent } from "applesauce-core/helpers/event";
import { ExtensionMissingError, ExtensionSigner } from "applesauce-signers";

import type { AccountMetadata } from "./metadata";
import { withTimeout } from "./remote-signer";
import { classifySignerError, SignerCouldNotDecryptError, SignerDeclinedError } from "./signer-errors";

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

/** A cipher's answer: a string, or `undefined` for no answer — `""` is a real plaintext. */
async function ask(request: () => Promise<unknown>): Promise<string | undefined> {
  const result = await withTimeout(Promise.resolve().then(request), EXTENSION_TIMEOUT_MS, LATE);
  return typeof result === "string" ? result : undefined;
}

async function text(request: () => Promise<unknown>): Promise<string> {
  const result = await ask(request);
  if (result === undefined) throw declined();
  return result;
}

/**
 * Absent only when the extension is here and lacks it. An extension that hasn't
 * injected yet may well have it — Nostash injects through a script tag, often
 * after the DM engine has started — so that is asked when called, and fails as
 * "missing" (try again later) rather than "can't" (pause for good).
 */
function timedCipher(
  nip: "NIP-04" | "NIP-44",
  pick: (nostr: Nip07) => Cipher | undefined,
  signer: TimedExtensionSigner,
) {
  const nostr = (window as unknown as { nostr?: Nip07 }).nostr;
  if (nostr && !pick(nostr)) return undefined;
  const cipher = () => {
    const found = pick(extension());
    if (!found) throw new Error(`Your signer extension can't encrypt (no ${nip}).`);
    return found;
  };
  return {
    encrypt: (pubkey: string, plaintext: string) => text(() => cipher().encrypt(pubkey, plaintext)),
    decrypt: async (pubkey: string, ciphertext: string) => {
      try {
        const plaintext = await ask(() => cipher().decrypt(pubkey, ciphertext));
        if (plaintext !== undefined) return plaintext;
        // Nostash's "no", or Alby's "couldn't open this". A signer that opens our
        // own test message just now didn't say no to this one.
        await signer.confirmCipher(nip, cipher);
        throw new SignerCouldNotDecryptError();
      } catch (error) {
        // A ciphertext that won't open is the message's fault — or a key that isn't
        // this account's. Only the extension can say which; ask before blaming it.
        if (classifySignerError(error) === "bad-payload") await signer.confirmProfile();
        throw error;
      }
    },
  };
}

/** How long one confirmation stands, so a run of broken messages asks once. */
const PROFILE_CONFIRMED_MS = 30_000;

type Confirmation = { at?: number; check: Promise<void> };

/** The library's signer, with a deadline on every request and a declined one thrown. */
export class TimedExtensionSigner extends ExtensionSigner {
  /**
   * The account this signer signs for. NIP-07 has no "profile changed" event, and
   * a decrypt with another profile's key fails exactly like a corrupt message —
   * which is remembered as unreadable for good. Signing is guarded by the Account
   * (`SignerMismatchError`); decrypting is guarded here, against this.
   */
  owner?: string;
  /** The last confirmation of each kind: `at` once it answered, absent while it is still asking. */
  private confirmed = new Map<string, Confirmation>();

  get nip04() {
    return timedCipher("NIP-04", (nostr) => nostr.nip04, this);
  }
  get nip44() {
    return timedCipher("NIP-44", (nostr) => nostr.nip44, this);
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

  /**
   * Resolves while the extension is still on `owner`'s profile; throws
   * `SignerMismatchError` once it isn't. Asks the extension afresh — its cached
   * pubkey is the one from sign-in — and when it can't say (declined, no answer)
   * that error stands instead: unconfirmed is never "the message is broken".
   */
  confirmProfile(): Promise<void> {
    const owner = this.owner;
    if (!owner) return Promise.resolve();
    return this.confirm("profile", async () => {
      const now = answered(await withTimeout(extension().getPublicKey(), EXTENSION_TIMEOUT_MS, LATE));
      if (now !== owner) throw new SignerMismatchError("Your signer extension is on a different profile.");
    });
  }

  /**
   * Resolves when the extension opens a message of our own — sealed to itself
   * and opened again — so an empty decrypt was that message's fault; throws the
   * decline when it answers this with nothing too.
   */
  confirmCipher(nip: string, cipher: () => Cipher): Promise<void> {
    return this.confirm(nip, async () => {
      const self = this.owner ?? (await this.getPublicKey());
      const probe = `brainstorm-${Date.now()}`;
      const sealed = await text(() => cipher().encrypt(self, probe));
      const opened = await text(() => cipher().decrypt(self, sealed));
      if (opened !== probe) throw new Error("Your signer extension opened a test message wrongly.");
    });
  }

  /**
   * One question in flight per kind, and a recent yes stands; a failure is
   * asked again next time.
   */
  private confirm(kind: string, question: () => Promise<void>): Promise<void> {
    const last = this.confirmed.get(kind);
    if (last && (last.at === undefined || Date.now() - last.at < PROFILE_CONFIRMED_MS)) return last.check;
    const entry: Confirmation = { check: Promise.resolve() };
    entry.check = question().then(() => {
      // From the answer, not the ask: a slow unlock still covers the run that follows.
      entry.at = Date.now();
    });
    this.confirmed.set(kind, entry);
    entry.check.catch(() => {
      if (this.confirmed.get(kind) === entry) this.confirmed.delete(kind);
    });
    return entry.check;
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
    if (signer instanceof TimedExtensionSigner) signer.owner = pubkey;
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
