/**
 * The passkey vault: the server's copy of a passkey-sealed key, which is what
 * lets a synced passkey sign in on a device that holds nothing yet.
 *
 * The owner's half (store, list, remove) rides the Active Account's Session. The
 * new device's half (challenge, open) has no Session to ride — the passkey's own
 * assertion is the credential. The server can't open what it stores: see ADR
 * 0009 here and ADR 0005 in brainstorm_server.
 */

import { adminJson, fetch, getBrainstormApi, jsonBody } from "./core";
import type { AssertionWire, SealedKey } from "@/accounts/passkey";

export interface PasskeyVaultEntry {
  credentialIdHash: string;
  /** The raw id, base64url — what a new passkey lists in `excludeCredentials`. */
  credentialId: string;
  label: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** The server holds no copy this passkey can open — or would not say. One answer for both, by design. */
export class PasskeyNotReadyError extends Error {
  constructor() {
    super("This passkey isn't set up for signing in on new devices yet");
    this.name = "PasskeyNotReadyError";
  }
}

const VAULT = "/passkeyVault";

export const passkeyVaultApi = {
  /** A single-use challenge for `openPasskeyVault`, good for two minutes. */
  async passkeyVaultChallenge(): Promise<string> {
    const response = await fetch(`${getBrainstormApi()}${VAULT}/challenge`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Couldn't reach the server (${response.status})`);
    const challenge = (await response.json())?.data?.challenge;
    if (typeof challenge !== "string") throw new Error("The server sent no challenge");
    return challenge;
  },

  /** The sealed key for an assertion over a challenge from `passkeyVaultChallenge`. */
  async openPasskeyVault(credentialIdHash: string, assertion: AssertionWire): Promise<string> {
    const response = await fetch(`${getBrainstormApi()}${VAULT}/${credentialIdHash}/open`, {
      ...jsonBody("POST", { assertion }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404) throw new PasskeyNotReadyError();
    if (!response.ok) throw new Error(`Couldn't reach the server (${response.status})`);
    const blob = (await response.json())?.data?.blob;
    if (typeof blob !== "string") throw new PasskeyNotReadyError();
    return blob;
  },

  /** Store the Active Account's seal under one of its passkeys. */
  storePasskeyVault(
    credentialIdHash: string,
    body: { sealed: SealedKey; publicKey: string; alg: number; label: string },
  ): Promise<PasskeyVaultEntry> {
    return adminJson<PasskeyVaultEntry>(
      `${VAULT}/${credentialIdHash}`,
      "Couldn't save the passkey",
      jsonBody("PUT", {
        credentialId: body.sealed.credentialId,
        publicKey: body.publicKey,
        alg: body.alg,
        blob: JSON.stringify(body.sealed),
        label: body.label.slice(0, 64),
      }),
    );
  },

  /** The Active Account's passkeys the server holds a copy for — every device's. */
  listPasskeyVaults(): Promise<PasskeyVaultEntry[]> {
    return adminJson<PasskeyVaultEntry[]>(VAULT, "Couldn't load your passkeys");
  },

  /** Remove one of the Active Account's copies. Idempotent. */
  async removePasskeyVault(credentialIdHash: string): Promise<void> {
    await adminJson<void>(`${VAULT}/${credentialIdHash}`, "Couldn't remove the passkey", { method: "DELETE" });
  },
};
