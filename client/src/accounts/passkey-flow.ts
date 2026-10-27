/**
 * Passkeys, end to end: adding one to an Account, keeping the server's copy in
 * step, and taking one away. Signing in or up with one is `login-flow.ts`, which
 * owns adopting an Account.
 *
 * The local half always comes first and always stands alone. A passkey added
 * here unlocks this device the moment its seal is written; the server's copy is
 * what makes it work on the *next* device, and is best-effort — a failed upload
 * leaves `synced: false`, retried whenever this Account next holds a Session.
 */
import { npubEncode } from "nostr-tools/nip19";

import { passkeyVaultApi, type PasskeyVaultEntry } from "@/services/api/passkeyVault";
import { LocalAccount } from "./local-account";
import { getMetadata, type BrainstormAccount } from "./metadata";
import { createPasskey, credentialIdHash, deviceName, passkeySupport, sealOf, type StoredPasskey } from "./passkey";
import { activeAccount } from "./signing";

export function passkeysOf(account: BrainstormAccount | undefined): StoredPasskey[] {
  return account instanceof LocalAccount ? (account.signer.data.passkeys ?? []) : [];
}

export function hasPasskey(account: BrainstormAccount | undefined): boolean {
  return passkeysOf(account).length > 0;
}

/** `npub1abcd…wxyz`: what the system sheet shows under a name, or instead of one. */
function shortNpub(pubkey: string): string {
  const npub = npubEncode(pubkey);
  return npub.length > 20 ? `${npub.slice(0, 10)}…${npub.slice(-4)}` : npub;
}

/**
 * Give this Account a passkey: the system sheet makes one (and, for most
 * providers, asks once more for its PRF output), the key is sealed under it and
 * kept, and the server is handed its copy when this Account can reach it.
 *
 * Unlocks first, like any other operation — so on a Locked Account the Unlock
 * modal comes before the passkey sheet. Throws what the ceremony throws: a cancel
 * is `isPasskeyCancelled`, a provider without PRF is `PasskeyPrfUnsupportedError`.
 */
export async function addPasskey(account: LocalAccount, name?: string): Promise<StoredPasskey> {
  if (account.locked) await account.unlock();
  const label = name || getMetadata(account).name;
  const short = shortNpub(account.pubkey);
  const created = await createPasskey({
    pubkey: account.pubkey,
    userName: label ? `${label} (${short})` : short,
    displayName: label || short,
    excludeCredentialIds: passkeysOf(account).map((passkey) => passkey.credentialId),
  });
  const stored = await account.signer.addPasskey(created.credentialId, created.prf, {
    provider: created.provider,
    device: deviceName(),
    addedAt: Date.now(),
    publicKey: created.publicKey,
    alg: created.alg,
    synced: false,
  });
  await syncPasskey(account, stored);
  return account.signer.data.passkeys?.find((passkey) => passkey.credentialId === stored.credentialId) ?? stored;
}

/**
 * Hand the server this passkey's seal, so the passkey signs in on other devices.
 * Only for the Active Account — the call rides its Session — and only for a
 * passkey whose public key we caught at creation. False when it didn't happen.
 */
export async function syncPasskey(account: LocalAccount, passkey: StoredPasskey): Promise<boolean> {
  if (passkey.synced || !passkey.publicKey || passkey.alg === undefined) return !!passkey.synced;
  if (activeAccount() !== account) return false;
  try {
    await passkeyVaultApi.storePasskeyVault(await credentialIdHash(passkey.credentialId), {
      sealed: sealOf(passkey),
      publicKey: passkey.publicKey,
      alg: passkey.alg,
      label: `${passkey.provider} · ${passkey.device}`,
    });
    account.signer.updatePasskey(passkey.credentialId, { synced: true });
    return true;
  } catch {
    return false;
  }
}

/** Retry every upload that hasn't landed yet. Quiet: nothing here is the user's to fix. */
export async function syncPendingPasskeys(account: BrainstormAccount | undefined): Promise<void> {
  if (!(account instanceof LocalAccount)) return;
  for (const passkey of passkeysOf(account)) {
    if (!passkey.synced) await syncPasskey(account, passkey);
  }
}

/**
 * One row of Settings' passkey list: a passkey this device keeps a seal for, one
 * the server holds a copy for (made on another device), or both.
 */
export type PasskeyListing = {
  credentialIdHash: string;
  provider: string;
  device: string;
  addedAt: number | null;
  lastUsedAt: number | null;
  local?: StoredPasskey;
  onServer: boolean;
};

function splitLabel(label: string | null): { provider: string; device: string } {
  const [provider, device] = (label ?? "").split(" · ");
  return { provider: provider || "Passkey", device: device || "another device" };
}

function timeOf(value: string | null): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
}

/** This device's passkeys and the server's, merged by credential. */
export async function listPasskeys(
  account: LocalAccount,
  server: PasskeyVaultEntry[] | null,
): Promise<PasskeyListing[]> {
  const rows = new Map<string, PasskeyListing>();
  for (const local of passkeysOf(account)) {
    const hash = await credentialIdHash(local.credentialId);
    rows.set(hash, {
      credentialIdHash: hash,
      provider: local.provider,
      device: local.device,
      addedAt: local.addedAt,
      lastUsedAt: null,
      local,
      onServer: false,
    });
  }
  for (const entry of server ?? []) {
    const held = rows.get(entry.credentialIdHash);
    if (held) {
      // The server's record was written where the passkey was made; a device that
      // signed in with it only knows it as "a passkey from another device".
      rows.set(entry.credentialIdHash, {
        ...held,
        ...(entry.label ? splitLabel(entry.label) : {}),
        addedAt: timeOf(entry.createdAt) ?? held.addedAt,
        onServer: true,
        lastUsedAt: timeOf(entry.lastUsedAt),
      });
    } else {
      rows.set(entry.credentialIdHash, {
        credentialIdHash: entry.credentialIdHash,
        ...splitLabel(entry.label),
        addedAt: timeOf(entry.createdAt),
        lastUsedAt: timeOf(entry.lastUsedAt),
        onServer: true,
      });
    }
  }
  return [...rows.values()].sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
}

/**
 * Take a passkey away: its seal leaves this device and the server's copy goes
 * with it. The passkey itself stays in the person's password manager — no site
 * can delete one — but it no longer opens anything.
 */
export async function removePasskey(account: LocalAccount, listing: PasskeyListing): Promise<void> {
  if (listing.onServer || listing.local?.synced) {
    await passkeyVaultApi.removePasskeyVault(listing.credentialIdHash);
  }
  if (listing.local) account.signer.removePasskey(listing.local.credentialId);
}

/** Whether to offer a passkey to this Account on this browser at all. */
export async function canOfferPasskey(account: BrainstormAccount | undefined): Promise<boolean> {
  if (!(account instanceof LocalAccount) || hasPasskey(account)) return false;
  if (getMetadata(account).passkeyOfferDeclined) return false;
  return (await passkeySupport()).supported;
}
