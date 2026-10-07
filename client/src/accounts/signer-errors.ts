/**
 * What a signer meant when a request failed — answered once, here, for every
 * feature that asks one.
 *
 * Each caller used to decide for itself, by matching the error's text: login had
 * one list of "refused" words, relay sign-in another, private messages a third
 * plus its own idea of a timeout. A signer whose "no" fell between them — Nostash
 * resolving `undefined` — was a refusal in one place, a fault in another and an
 * unreadable message in a third. Callers now map these kinds to what they do;
 * the deciding lives here.
 *
 * Typed errors first: the ones this app's own signers throw are certain. Text
 * comes last, for what arrives from outside as a bare string — a NIP-46 bunker's
 * `error` field, an extension's rejection, Amber's "Canceled".
 */
import { SignerMismatchError } from "applesauce-accounts";
import { ExtensionMissingError } from "applesauce-signers";

import { isUnlockCancelled } from "./local-signer";
import { isRemoteSignerTimeout } from "./remote-signer";

export type SignerErrorKind =
  /** The reader dismissed our own unlock prompt: a key held here, never asked. */
  | "cancelled"
  /** The signer said no — the reader declined its prompt, or it refuses this app. */
  | "declined"
  /**
   * No answer in time: a prompt never seen, a bunker gone quiet. Worth asking again.
   * Only our typed deadline (`RemoteSignerTimeoutError`), which every signer here
   * throws — never a message that says "timeout", which a relay sends too.
   */
  | "timeout"
  /** No signer to ask: the extension isn't in this browser (yet). */
  | "missing"
  /** The signer answered as someone else — an extension switched to another profile. */
  | "wrong-account"
  /** A decrypt the signer attempted and couldn't open: the ciphertext, not the signer. */
  | "bad-payload"
  /** The signer (or its relay) asked us to slow down: Amethyst's "rate limited". Ask again later. */
  | "rate-limited"
  | "unknown";

/** Thrown when a signer answers with nothing — the reader declined (Nostash, Nostore). */
export class SignerDeclinedError extends Error {
  constructor(message = "Your signer declined the request.") {
    super(message);
    this.name = "SignerDeclinedError";
  }
}

/**
 * Thrown when a signer answers a decrypt with nothing yet opens our own test
 * message at once: Alby resolves `undefined` for a ciphertext it can't open
 * (spam, a corrupt wrap) instead of rejecting. The message, not the signer.
 */
export class SignerCouldNotDecryptError extends Error {
  constructor(message = "Your signer couldn't open this message.") {
    super(message);
    this.name = "SignerCouldNotDecryptError";
  }
}

const nameOf = (error: unknown) => (error as { name?: unknown })?.name;
/** The text of whatever a signer threw — an Error, Amber's bare string, anything. */
export const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : String(error ?? "");

/**
 * nos2x rejects with "denied"; others with "User rejected…"; NIP-46 bunkers send
 * free text such as "user rejected" or "not authorized"; Amber's clipboard flow
 * rejects with the bare string "Canceled".
 */
const DECLINED = /reject|denied|declin|cancel|refus|not (allowed|authori[sz]ed|permitted)|permission/i;
/** A signer, or a relay on its behalf (NIP-01's `rate-limited:` prefix), asking for fewer requests. */
const RATE_LIMITED = /rate[- ]?limit|too many requests|slow down/i;
/** nostr-tools' NIP-44 and NIP-04 decrypt failures, as an extension relays them. */
const BAD_PAYLOAD = /invalid (mac|payload|padding|base64)|unknown (encryption )?version|invalid.*length|payload must/i;

export function classifySignerError(error: unknown): SignerErrorKind {
  if (isUnlockCancelled(error)) return "cancelled";
  if (isRemoteSignerTimeout(error)) return "timeout";
  // Another tab held the extension past the wait: never asked, worth asking again.
  if (nameOf(error) === "ExtensionBusyError") return "timeout";
  if (error instanceof SignerDeclinedError || nameOf(error) === "SignerDeclinedError") return "declined";
  if (error instanceof SignerCouldNotDecryptError || nameOf(error) === "SignerCouldNotDecryptError")
    return "bad-payload";
  if (error instanceof ExtensionMissingError) return "missing";
  if (error instanceof SignerMismatchError) return "wrong-account";

  const message = messageOf(error);
  if (RATE_LIMITED.test(message)) return "rate-limited";
  if (BAD_PAYLOAD.test(message)) return "bad-payload";
  if (DECLINED.test(message)) return "declined";
  return "unknown";
}

/**
 * The reader's own "no" — their signer declined, or they dismissed our unlock.
 * Only that is a decision to respect; everything else is worth trying again.
 */
export function signerSaidNo(error: unknown): boolean {
  const kind = classifySignerError(error);
  return kind === "declined" || kind === "cancelled";
}
