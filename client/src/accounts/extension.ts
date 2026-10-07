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
import { isRemoteSignerTimeout, withTimeout } from "./remote-signer";
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

/**
 * One request at a time to the extension, across every Brainstorm tab. Nostash keeps
 * the reply for a request in one shared variable, so two requests in flight at once
 * get each other's answers — measured on Nostash 2.1 in Safari: eight decrypts at
 * once came back shifted onto the wrong requests, some never at all. The Account
 * queue already keeps one tab to one at a time; a Web Lock does it across tabs. The
 * lock is held while we wait for the answer, and let go at the request's deadline —
 * the extension may still answer after that (a prompt approved late); the decrypt
 * path asks again before it blames a message, which contains that.
 *
 * The wait for the lock is capped too: a tab holding it with its timers frozen (iOS
 * suspends a backgrounded Safari tab) would otherwise block sign-in, sending and
 * opening messages in every other tab for as long as it stayed frozen.
 */
async function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return work();
  const waiting = new AbortController();
  const giveUp = setTimeout(() => waiting.abort(), LOCK_WAIT_MS);
  let granted = false;
  try {
    return (await locks.request(EXTENSION_LOCK, { signal: waiting.signal }, () => {
      granted = true;
      clearTimeout(giveUp);
      return work();
    })) as T;
  } catch (error) {
    if (!granted && waiting.signal.aborted) throw new ExtensionBusyError();
    throw error;
  } finally {
    clearTimeout(giveUp);
  }
}
export const EXTENSION_LOCK = "brainstorm-nip07";
/** Longer than any one holder needs (a 90s prompt, plus a check): past this, the holder is stuck. */
export const LOCK_WAIT_MS = 100_000;

/** Never reached the extension: another tab held it past LOCK_WAIT_MS. Worth asking again. */
export class ExtensionBusyError extends Error {
  constructor() {
    super("Your signer extension is busy in another Brainstorm tab.");
    this.name = "ExtensionBusyError";
  }
}

/**
 * How long a decrypt may go unanswered before we look into it. Nostash never answers
 * a decrypt it can't perform (spam, a corrupt wrap, another key's) — its error goes
 * nowhere — so a wrap like that held the account's queue for EXTENSION_TIMEOUT_MS on
 * every visit. Its answers otherwise come back in well under a second; this is long
 * past any slow one. Not shorter: Nostash keeps one reply slot for every request, so
 * a late answer to a request we stopped waiting for lands on the next one — with a
 * 5s cut, measured, it stored messages under the wrong gift wraps.
 */
export const EXTENSION_DECRYPT_MS = 30_000;
/**
 * The second ask, once the extension has just answered our test message: it is
 * awake and answering, so a wrap it can open comes back in a blink. A wrap is
 * blamed only after this second silence — one lost request (iOS unloading the
 * extension mid-request, a prompt read for a long time) never costs a message.
 */
export const EXTENSION_RETRY_DECRYPT_MS = 10_000;
/**
 * The engine's deadline for one wrap from an extension: everything above, in the
 * worst case — the wait for the lock, both asks and the checks between them. The
 * signer's own deadlines end every request; this only frees a slot they somehow didn't.
 */
export const EXTENSION_WRAP_DEADLINE_MS = LOCK_WAIT_MS + EXTENSION_DECRYPT_MS + EXTENSION_RETRY_DECRYPT_MS + 4 * 10_000;
/** An answer this fast had no person in the way: no approval prompt is open. */
const QUICK_ANSWER_MS = 2_000;
/** How long a quick answer vouches that prompts are already allowed. */
const STILL_QUICK_MS = 120_000;

/**
 * A cipher's answer: a string, or `undefined` for no answer — `""` is a real plaintext.
 * `onAnswered` hears how long the extension itself took — from when it was asked, not
 * from when we started waiting for the lock: an answer that waited 20s behind another
 * tab still came back in a blink, and counting the wait hid that.
 */
async function ask(
  request: () => Promise<unknown>,
  deadlineMs = EXTENSION_TIMEOUT_MS,
  onAnswered?: (tookMs: number) => void,
): Promise<string | undefined> {
  return oneAtATime(async () => {
    const asked = Date.now();
    const result = await withTimeout(Promise.resolve().then(request), deadlineMs, LATE);
    if (typeof result !== "string") return undefined;
    onAnswered?.(Date.now() - asked);
    return result;
  });
}

async function text(request: () => Promise<unknown>, onAnswered?: (tookMs: number) => void): Promise<string> {
  const result = await ask(request, EXTENSION_TIMEOUT_MS, onAnswered);
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
        const noteAnswer = (tookMs: number) => signer.noteAnswer(tookMs);
        let plaintext: string | undefined;
        try {
          plaintext = await ask(() => cipher().decrypt(pubkey, ciphertext), EXTENSION_DECRYPT_MS, noteAnswer);
        } catch (error) {
          // Silent for EXTENSION_DECRYPT_MS from an extension that had been answering by
          // itself (no prompt open): Nostash's way of failing — or one request lost.
          // Awake (it opens our own test message) and silent again on a second ask:
          // the wrap is what failed, remembered so it costs this once.
          if (!isRemoteSignerTimeout(error) || !signer.answersQuickly()) throw error;
          await signer.confirmCipher(nip, cipher);
          try {
            plaintext = await ask(() => cipher().decrypt(pubkey, ciphertext), EXTENSION_RETRY_DECRYPT_MS, noteAnswer);
          } catch (again) {
            if (!isRemoteSignerTimeout(again)) throw again;
            throw new SignerCouldNotDecryptError();
          }
        }
        if (plaintext !== undefined) return plaintext;
        // Nostash's "no", or Alby's "couldn't open this". A signer that opens our
        // own test message just now didn't say no to this one: the message is what failed.
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
  /** When a decrypt was last answered in under QUICK_ANSWER_MS. */
  private quickAt = -Infinity;

  noteAnswer(tookMs: number): void {
    if (tookMs < QUICK_ANSWER_MS) this.quickAt = Date.now();
  }

  /** Answering by itself lately: a silence now is a request it dropped, not a prompt open. */
  answersQuickly(): boolean {
    return Date.now() - this.quickAt < STILL_QUICK_MS;
  }

  get nip04() {
    return timedCipher("NIP-04", (nostr) => nostr.nip04, this);
  }
  get nip44() {
    return timedCipher("NIP-44", (nostr) => nostr.nip44, this);
  }

  async getPublicKey(): Promise<string> {
    const nostr = extension();
    if (this.pubkey) return this.pubkey;
    const key = answered(await oneAtATime(() => withTimeout(nostr.getPublicKey(), EXTENSION_TIMEOUT_MS, LATE)));
    if (typeof key !== "string" || !isHexKey(key)) throw new Error("Extension returned an invalid public key");
    this.pubkey = key;
    return key;
  }

  async signEvent(template: EventTemplate): Promise<VerifiedEvent> {
    const event = answered(
      await oneAtATime(() => withTimeout(extension().signEvent(template), EXTENSION_TIMEOUT_MS, LATE)),
    );
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
      const now = answered(await oneAtATime(() => withTimeout(extension().getPublicKey(), EXTENSION_TIMEOUT_MS, LATE)));
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
      // Answered by itself, quickly: it still opens decrypts without a prompt — which keeps
      // a long run of unreadable wraps (each one silence, then this) from looking like one.
      const opened = await text(
        () => cipher().decrypt(self, sealed),
        (tookMs) => this.noteAnswer(tookMs),
      );
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
