# A passkey unlocks a key we hold; it is never the Backup

**Status:** accepted, 2026-10-27.

A passkey (Face ID, Touch ID, Windows Hello, a fingerprint) is a third at-rest form of a `LocalAccount`'s key,
beside the Unlock cache and the ncryptsec Backup of [ADR 0001](0001-ncryptsec-canonical-vault-as-unlock-cache.md).
It stands in for typing the Recovery password, and, because passkeys sync through iCloud Keychain, Google Password
Manager and the like, it carries the key to a device that holds nothing yet. It is not a new Signer: the app still
holds the key and signs with it in memory.

## How the key is sealed

The passkey's PRF output (the WebAuthn `prf` extension: an HMAC the authenticator computes over a fixed input,
after user verification, without revealing its secret) goes through HKDF-SHA256 to an AES-256-GCM key, which
encrypts the 32-byte key with `pubkey:credentialId` as associated data. The seal is kept on the Account
(`LocalSignerData.passkeys`) and, byte for byte, by the backend (`/passkeyVault`, brainstorm_server ADR 0005),
which can open neither. The PRF output never leaves the page. `user.id` is the pubkey, so a passkey picked on a new
device names its account before anything is fetched. `rp.id` is the page's host, so staging's and production's
passkeys never see each other.

Code: `accounts/passkey.ts` (ceremonies, seal, labels), `accounts/passkey-flow.ts` (add, sync, list, remove),
`loginWithPasskey` and `createAccount({ passkey: true })` in `accounts/login-flow.ts`.

## Considered options

- **The passkey as the only at-rest form, unlocking on every page load** (what zap.cooking ships) — a Face ID
  prompt per reload. Rejected: the Unlock cache already makes same-device reloads silent, so the passkey is only
  asked for where a password would have been.
- **Keep the seal on this device only** — the passkey would replace a password only on a device that already has
  an Unlock cache, the case that needs it least. The value is the new device.
- **Publish the seal as a Nostr event** — no backend work, but public forever and fetchable without a live
  ceremony. The backend gates its copy behind an assertion over a single-use challenge.
- **Passkey replaces the Backup** — rejected. A passkey depends on its provider; losing the Apple or Google account
  loses both. The Backup stays canonical and portable, and the backup reminder still asks for it.

## Consequences

- ADR 0001's four states become eight: any of them plus passkeys. A passkey-only Account (signed up with a passkey,
  no Unlock cache) is persistable and starts Locked; its Unlock modal offers the passkey and "sign in with your key"
  rather than a password it doesn't have.
- Signup can skip the password: a name and one passkey prompt. The backup reminder then asks for the Recovery
  password to mint the Backup — worded for an account that isn't browser-bound, since it isn't.
- The passkey is offered once, right after a password unlock, and never to someone who pasted an nsec.
- Upload is best-effort and rides the Active Account's Session: a seal that hasn't reached the server is marked
  `synced: false` and retried on the next passkey unlock or visit to Settings. Until then it works on this device
  only, and Settings says so.
- A browser without PRF (Firefox for Android today, any provider that reports `prf.enabled: false`) never shows the
  option; a provider that guessed wrong fails at setup with nothing changed, and is told how to delete the orphan
  passkey — no site can delete one.
- `PASSKEY_ORIGINS` on the backend must list every UI origin whose passkeys should sign in on new devices.
