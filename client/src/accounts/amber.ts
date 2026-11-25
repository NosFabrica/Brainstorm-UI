/**
 * Amber on this phone, over NIP-55 intents rather than relays.
 *
 * This is not a second way to reach a remote signer — it is the only way to
 * reach some of them. Amber ships an `offline` build with the `INTERNET`
 * permission removed from its manifest, which cannot speak NIP-46 at all, and
 * the people who install that build are exactly the people we would otherwise
 * be telling to paste a raw nsec.
 *
 * It also can't be lost the way NIP-46 can. Amber answers a request it hasn't
 * been told to remember with an Android notification and no wire response; here
 * the approval screen is in the foreground and cannot be missed.
 *
 * The cost is real and accepted: an app switch, an approval and a clipboard read
 * on *every* signature. That's why it's a row shown only where it works, not a
 * default.
 */
import { AmberClipboardAccount } from "applesauce-accounts/accounts";
import { AmberClipboardSigner } from "applesauce-signers/signers/amber-clipboard-signer";
import type { SerializedAccount } from "applesauce-accounts";

import type { AccountMetadata } from "./metadata";
import { isRemoteSignerTimeout, withTimeout } from "./signer-timeout";

/**
 * How long Amber gets before we admit it isn't coming back.
 *
 * Generous, because the whole flow is an app switch and a human tapping approve.
 * The point is only that it *ends*: the library reads its answer off the
 * clipboard on the next `visibilitychange` and registers the pending request
 * 500ms after the app switch, so an auto-approving Amber that returns inside that
 * window is never read — and a clipboard permission the user never grants, or a
 * build that stopped answering through the clipboard at all, look the same. All
 * three used to sit on "Waiting for Amber" for the life of the page.
 */
export const AMBER_TIMEOUT_MS = 60_000;

const LATE = "Amber didn't answer. Open it and check for a request waiting there.";

/**
 * The engine's deadline for one wrap through Amber: none of its own. Each of the
 * wrap's two requests ends within AMBER_TIMEOUT_MS of being *issued* (the signer's
 * own deadline, below), however long it waited in the account's queue first — a
 * deadline started when the engine asked ran out while the request was still
 * queued, and the request prompted anyway once its turn came, for nobody.
 */
export const AMBER_WRAP_DEADLINE_MS = Number.POSITIVE_INFINITY;

/** The library's signer, with a deadline on every app switch. */
export class TimedAmberSigner extends AmberClipboardSigner {
  /**
   * The deadline starts when the request is made (the app switch), and a request
   * that runs out is let go of: still pending, the next return to the app read the
   * clipboard into a request nobody was waiting for any more.
   */
  private timed<T>(work: Promise<T>): Promise<T> {
    return withTimeout(work, AMBER_TIMEOUT_MS, LATE).catch((error: unknown) => {
      if (isRemoteSignerTimeout(error)) this.rejectPending();
      throw error;
    });
  }
  getPublicKey(): Promise<string> {
    return this.timed(super.getPublicKey());
  }
  signEvent(template: Parameters<AmberClipboardSigner["signEvent"]>[0]) {
    return this.timed(super.signEvent(template));
  }
  nip04Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.timed(super.nip04Encrypt(pubkey, plaintext));
  }
  nip04Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.timed(super.nip04Decrypt(pubkey, ciphertext));
  }
  nip44Encrypt(pubkey: string, plaintext: string): Promise<string> {
    return this.timed(super.nip44Encrypt(pubkey, plaintext));
  }
  nip44Decrypt(pubkey: string, ciphertext: string): Promise<string> {
    return this.timed(super.nip44Decrypt(pubkey, ciphertext));
  }
}

/**
 * The Account behind Amber, so a *restored* one gets the deadlines too — the
 * library's `fromJSON` builds a bare signer, and the sign-in path is not the only
 * place an app switch can be lost. The serialised form and the type string are
 * the library's own, exactly as `RemoteAccount` keeps `"nostr-connect"`.
 */
export class AmberAccount<Metadata = AccountMetadata> extends AmberClipboardAccount<Metadata> {
  static fromJSON<Metadata = AccountMetadata>(json: SerializedAccount<void, Metadata>): AmberAccount<Metadata> {
    const account = new AmberAccount<Metadata>(json.pubkey, new TimedAmberSigner());
    return super.loadCommonFields(account, json) as AmberAccount<Metadata>;
  }
}

/**
 * Whether this device can use it. Android plus a readable clipboard — the same
 * test the library makes, asked at render so the row simply isn't there
 * elsewhere.
 */
export function isAmberSupported(): boolean {
  return !!AmberClipboardSigner.SUPPORTED;
}

/**
 * Ask Amber who the user is. The pubkey comes back through the clipboard after
 * an app switch, so this settles only once they return.
 */
export async function amberAccount(): Promise<AmberClipboardAccount<AccountMetadata>> {
  const signer = new TimedAmberSigner();
  try {
    const pubkey = await signer.getPublicKey();
    return new AmberAccount<AccountMetadata>(pubkey, signer);
  } catch (error) {
    // The listener outlives a failed handshake otherwise, and every later
    // app-switch would read the clipboard for a signature nobody asked for.
    signer.destroy();
    throw error;
  }
}
