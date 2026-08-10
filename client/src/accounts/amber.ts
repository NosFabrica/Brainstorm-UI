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

import type { AccountMetadata } from "./metadata";

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
  const signer = new AmberClipboardSigner();
  try {
    const pubkey = await signer.getPublicKey();
    return new AmberClipboardAccount<AccountMetadata>(pubkey, signer);
  } catch (error) {
    // The listener outlives a failed handshake otherwise, and every later
    // app-switch would read the clipboard for a signature nobody asked for.
    signer.destroy();
    throw error;
  }
}
