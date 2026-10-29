/**
 * Passkeys as a way to unlock a key this app holds: the WebAuthn ceremonies, the
 * seal they open, and the words a device calls them by.
 *
 * A passkey here is not a Signer and not a Backup. It is a third at-rest form of
 * a `LocalAccount`'s key, beside the Unlock cache and the ncryptsec — one that
 * opens with Face ID instead of a Recovery password, and, because passkeys sync,
 * one that can travel to a new device (see `passkey-flow.ts` and ADR 0009).
 *
 * The seal: the passkey's PRF output (an HMAC the authenticator computes over a
 * fixed input, after user verification, without ever revealing its secret) goes
 * through HKDF to an AES-256-GCM key, which encrypts the 32-byte Nostr key with
 * the pubkey and credential id as associated data. The PRF output never leaves
 * this page: not to storage, not to the server.
 *
 * Pure of storage and of the network: bytes and ceremonies in, sealed records out.
 */
import { bytesToHex, hexToBytes } from "nostr-tools/utils";

/** PRF input and HKDF labels. Changing any of them orphans every sealed key. */
const PRF_INPUT = new TextEncoder().encode("brainstorm.passkey.v1");
const HKDF_SALT = new TextEncoder().encode("brainstorm/passkey/v1");
const HKDF_INFO = new TextEncoder().encode("seal-nostr-key");

/** COSE algorithms we ask for, in preference order — the server verifies all three. */
const PUB_KEY_PARAMS: PublicKeyCredentialParameters[] = [
  { type: "public-key", alg: -7 }, // ES256
  { type: "public-key", alg: -8 }, // EdDSA
  { type: "public-key", alg: -257 }, // RS256
];

/**
 * A key sealed under one passkey. The same record is stored on the Account and,
 * byte for byte, as the server's blob — the server checks `pubkey` and
 * `credentialId` and can open nothing.
 */
export type SealedKey = {
  v: 1;
  pubkey: string;
  /** The credential's raw id, base64url. */
  credentialId: string;
  iv: string;
  ciphertext: string;
};

/** A passkey as an Account keeps it: its seal, and what Settings says about it. */
export type StoredPasskey = SealedKey & {
  /** Who keeps the passkey ("iCloud Keychain"), from the authenticator's AAGUID. */
  provider: string;
  /** What it was made on ("iPhone"), from the user agent. */
  device: string;
  addedAt: number;
  /** The credential's public key (SPKI DER, base64url) and COSE alg — what the server verifies with. */
  publicKey?: string;
  alg?: number;
  /** The server holds this seal, so the passkey can sign in on another device. */
  synced?: boolean;
};

// ── errors ──────────────────────────────────────────────────────────────────

/** The person closed the system sheet. A deliberate no, never reported as a failure. */
export function isPasskeyCancelled(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

/**
 * The provider already holds a passkey for this account (one we listed in
 * `excludeCredentials`). Making another would have replaced it, and with it every
 * seal it opens — so the browser refused, and we say so rather than retry.
 */
export function isPasskeyAlreadyThere(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === "InvalidStateError";
}

/**
 * The provider made a passkey but can't derive a key from it (no PRF). Nothing
 * was changed on our side; `orphan` says a useless passkey now sits in their
 * password manager, which only they can delete.
 */
export class PasskeyPrfUnsupportedError extends Error {
  constructor(readonly orphan: boolean) {
    super("This passkey can't be used to lock your key");
    this.name = "PasskeyPrfUnsupportedError";
  }
}

/** The passkey answered, but its seal didn't open — it isn't this key's passkey. */
export class PasskeyMismatchError extends Error {
  constructor(message = "That passkey doesn't open this account") {
    super(message);
    this.name = "PasskeyMismatchError";
  }
}

// ── base64url ───────────────────────────────────────────────────────────────

export function toB64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The server's row key for a credential: sha256 of its raw id, hex. */
export async function credentialIdHash(credentialId: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", fromB64url(credentialId))));
}

// ── the seal ────────────────────────────────────────────────────────────────

async function sealingKey(prf: Uint8Array): Promise<CryptoKey> {
  if (prf.length !== 32) throw new PasskeyPrfUnsupportedError(false);
  const base = await crypto.subtle.importKey("raw", prf as Uint8Array, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function associatedData(pubkey: string, credentialId: string): Uint8Array {
  return new TextEncoder().encode(`${pubkey}:${credentialId}`);
}

/** Seal `key` under a passkey's PRF output. */
export async function sealKey(
  key: Uint8Array,
  pubkey: string,
  credentialId: string,
  prf: Uint8Array,
): Promise<SealedKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: associatedData(pubkey, credentialId) },
    await sealingKey(prf),
    key as Uint8Array,
  );
  return { v: 1, pubkey, credentialId, iv: toB64url(iv), ciphertext: toB64url(ciphertext) };
}

/** Open a seal. Fails closed — `PasskeyMismatchError` — on any other passkey, pubkey or tampering. */
export async function openSealedKey(sealed: SealedKey, prf: Uint8Array): Promise<Uint8Array> {
  try {
    const key = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: fromB64url(sealed.iv),
          additionalData: associatedData(sealed.pubkey, sealed.credentialId),
        },
        await sealingKey(prf),
        fromB64url(sealed.ciphertext),
      ),
    );
    if (key.length !== 32) throw new PasskeyMismatchError();
    return key;
  } catch (error) {
    if (error instanceof PasskeyMismatchError || error instanceof PasskeyPrfUnsupportedError) throw error;
    throw new PasskeyMismatchError();
  }
}

/** The fields of a stored passkey that make up its seal — the server's blob. */
export function sealOf(passkey: StoredPasskey): SealedKey {
  const { v, pubkey, credentialId, iv, ciphertext } = passkey;
  return { v, pubkey, credentialId, iv, ciphertext };
}

/** A blob from the server, checked for shape before anything trusts it. */
export function parseSealedKey(blob: string): SealedKey | null {
  try {
    const record = JSON.parse(blob) as Partial<SealedKey>;
    if (
      record?.v !== 1 ||
      typeof record.pubkey !== "string" ||
      !/^[0-9a-f]{64}$/.test(record.pubkey) ||
      typeof record.credentialId !== "string" ||
      typeof record.iv !== "string" ||
      typeof record.ciphertext !== "string"
    ) {
      return null;
    }
    // Only the seal's own fields: whatever else a server put in the blob is not
    // ours to keep on the Account.
    const { pubkey, credentialId, iv, ciphertext } = record;
    return { v: 1, pubkey, credentialId, iv, ciphertext };
  } catch {
    return null;
  }
}

// ── support ─────────────────────────────────────────────────────────────────

export type PasskeySupport =
  { supported: true } | { supported: false; reason: "insecure-context" | "no-webauthn" | "no-prf" };

type ClientCapabilities = Record<string, boolean | undefined>;
type PublicKeyCredentialStatics = {
  getClientCapabilities?: () => Promise<ClientCapabilities>;
};

/**
 * Whether this browser can lock a key with a passkey. Provisional when it says
 * yes: Safari reports no PRF capability either way, and an absent capability
 * means "unknown", so only an explicit no hides the feature. The setup ceremony
 * is the real test, and fails cleanly where this guessed wrong.
 */
export async function passkeySupport(): Promise<PasskeySupport> {
  if (typeof window === "undefined" || !window.isSecureContext) return { supported: false, reason: "insecure-context" };
  const pkc = (window as unknown as { PublicKeyCredential?: PublicKeyCredentialStatics }).PublicKeyCredential;
  if (!pkc || !navigator.credentials?.create) return { supported: false, reason: "no-webauthn" };
  // Firefox for Android has no bridge to Credential Manager's PRF, and doesn't say so.
  if (/Android/i.test(navigator.userAgent) && /Firefox\//i.test(navigator.userAgent)) {
    return { supported: false, reason: "no-prf" };
  }
  try {
    const caps = await pkc.getClientCapabilities?.();
    if (caps?.["extension:prf"] === false) return { supported: false, reason: "no-prf" };
  } catch {
    /* a probe that throws tells us nothing */
  }
  return { supported: true };
}

// ── what the device calls it ────────────────────────────────────────────────

export type PasskeyMethod = {
  /** For chips and short labels: "Face ID", "Passkey". */
  label: string;
  /** After "with": "Face ID", "a passkey". */
  withPhrase: string;
};

/**
 * A guess from the user agent, so it only ever names the method a device most
 * likely uses and falls back to the generic word where it can't tell — an iPad
 * has either Face ID or Touch ID, an Android phone a fingerprint or a PIN.
 */
export function passkeyMethod(userAgent: string = navigator.userAgent): PasskeyMethod {
  const named = (label: string): PasskeyMethod => ({ label, withPhrase: label });
  if (/iPhone/.test(userAgent)) return named("Face ID");
  if (/Macintosh/.test(userAgent) && !(typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) {
    return named("Touch ID");
  }
  if (/Windows/.test(userAgent)) return named("Windows Hello");
  return { label: "Passkey", withPhrase: "a passkey" };
}

/** What the device is, for "Added on iPhone". */
export function deviceName(userAgent: string = navigator.userAgent): string {
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/CrOS/.test(userAgent)) return "Chromebook";
  if (/Linux/.test(userAgent)) return "Linux";
  return "this device";
}

/**
 * Passkey providers by AAGUID, from the community list
 * (github.com/passkeydeveloper/passkey-authenticator-aaguids). An unknown or
 * all-zero AAGUID is just "Passkey".
 */
const PROVIDERS: Record<string, string> = {
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "531126d6-e717-415c-9320-3d9aa6981239": "Dashlane",
  "53414d53-554e-4700-0000-000000000000": "Samsung Pass",
  "b84e4048-15dc-4dd0-8640-f4f60813c8af": "NordPass",
  "50726f74-6f6e-5061-7373-50726f746f6e": "Proton Pass",
};

export function providerName(aaguid: string | undefined): string {
  return (aaguid && PROVIDERS[aaguid]) || "Passkey";
}

/** The AAGUID in a registration's authenticator data (bytes 37–53), as a UUID. */
export function aaguidOf(authenticatorData: ArrayBuffer | undefined): string | undefined {
  if (!authenticatorData || authenticatorData.byteLength < 53) return undefined;
  const hex = bytesToHex(new Uint8Array(authenticatorData, 37, 16));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── ceremonies ──────────────────────────────────────────────────────────────

type PrfOutputs = { enabled?: boolean; results?: { first?: ArrayBuffer | ArrayBufferView } };

function prfOf(credential: PublicKeyCredential): { enabled?: boolean; first: Uint8Array | null } {
  const prf = (credential.getClientExtensionResults() as { prf?: PrfOutputs }).prf;
  const first = prf?.results?.first;
  let bytes: Uint8Array | null = null;
  // The spec says ArrayBuffer; some bridges hand back a view into a bigger buffer.
  if (first instanceof ArrayBuffer) bytes = new Uint8Array(first);
  else if (first && ArrayBuffer.isView(first)) bytes = new Uint8Array(first.buffer, first.byteOffset, first.byteLength);
  return { enabled: prf?.enabled, first: bytes && bytes.length === 32 ? bytes : null };
}

function prfExtension(): AuthenticationExtensionsClientInputs {
  return { prf: { eval: { first: PRF_INPUT } } } as AuthenticationExtensionsClientInputs;
}

/**
 * The relying party is the host, so every environment's passkeys are its own:
 * staging and production never see each other's, and the server derives the
 * same id from the origin it allows.
 */
function rpId(): string {
  return location.hostname;
}

/** A WebAuthn `get()` response, every buffer base64url — what the server verifies. */
export type AssertionWire = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
};

export type PasskeyAssertion = {
  credentialId: string;
  /** The account the passkey was made for: `user.id` is the 32-byte pubkey. */
  pubkey: string | null;
  prf: Uint8Array;
  wire: AssertionWire;
};

/**
 * Ask a passkey for its PRF output. `credentialIds` narrows the sheet to the
 * passkeys of one Account; without it the sheet offers every passkey for this
 * site — the new-device sign-in. `challenge` is the server's, when the assertion
 * is going to be redeemed there.
 */
export async function assertPasskey(
  options: { credentialIds?: string[]; challenge?: string } = {},
): Promise<PasskeyAssertion> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: options.challenge ? fromB64url(options.challenge) : crypto.getRandomValues(new Uint8Array(32)),
      rpId: rpId(),
      allowCredentials: (options.credentialIds ?? []).map((id) => ({ type: "public-key", id: fromB64url(id) })),
      userVerification: "required",
      extensions: prfExtension(),
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new PasskeyMismatchError("No passkey answered");
  const { first } = prfOf(credential);
  if (!first) throw new PasskeyPrfUnsupportedError(false);
  const response = credential.response as AuthenticatorAssertionResponse;
  const userHandle = response.userHandle ? new Uint8Array(response.userHandle) : null;
  return {
    credentialId: toB64url(credential.rawId),
    pubkey: userHandle?.length === 32 ? bytesToHex(userHandle) : null,
    prf: first,
    wire: {
      credentialId: toB64url(credential.rawId),
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.authenticatorData),
      signature: toB64url(response.signature),
    },
  };
}

export type CreatedPasskey = {
  credentialId: string;
  prf: Uint8Array;
  provider: string;
  publicKey?: string;
  alg?: number;
};

/**
 * Make a passkey for an Account and get its PRF output — in one prompt where the
 * provider returns PRF at creation, in two where it only does on `get()` (most of
 * them, today). `user.id` is the pubkey, so a passkey picked on a new device
 * says which account it is for before anything is fetched.
 */
export async function createPasskey(options: {
  pubkey: string;
  userName: string;
  displayName: string;
  excludeCredentialIds?: string[];
}): Promise<CreatedPasskey> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: rpId(), name: "Brainstorm" },
      user: { id: hexToBytes(options.pubkey) as Uint8Array, name: options.userName, displayName: options.displayName },
      pubKeyCredParams: PUB_KEY_PARAMS,
      authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
      excludeCredentials: (options.excludeCredentialIds ?? []).map((id) => ({
        type: "public-key",
        id: fromB64url(id),
      })),
      extensions: prfExtension(),
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new PasskeyMismatchError("No passkey was created");

  const credentialId = toB64url(credential.rawId);
  const response = credential.response as AuthenticatorAttestationResponse;
  let publicKey: string | undefined;
  let alg: number | undefined;
  try {
    const spki = response.getPublicKey?.();
    if (spki) {
      publicKey = toB64url(spki);
      alg = response.getPublicKeyAlgorithm?.();
    }
  } catch {
    /* a provider without getPublicKey: the passkey works here, it just can't sync */
  }
  let provider = "Passkey";
  try {
    provider = providerName(aaguidOf(response.getAuthenticatorData?.()));
  } catch {
    /* unknown provider */
  }

  const created = prfOf(credential);
  if (created.enabled === false) throw new PasskeyPrfUnsupportedError(true);
  if (created.first) return { credentialId, prf: created.first, provider, publicKey, alg };

  // No PRF at creation: ask once more, for this passkey only.
  try {
    const asserted = await assertPasskey({ credentialIds: [credentialId] });
    return { credentialId, prf: asserted.prf, provider, publicKey, alg };
  } catch (error) {
    if (error instanceof PasskeyPrfUnsupportedError) throw new PasskeyPrfUnsupportedError(true);
    throw error;
  }
}
