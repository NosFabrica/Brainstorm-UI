# UI

The Brainstorm frontend. Holds the User's Nostr identities, signs and publishes
on their behalf, and renders the web-of-trust the backend computes.

## Language

### Identity

**Account**:
One Nostr identity as this app holds it — a pubkey together with the means to
sign for it. Every Account can sign; the app holds no identity it cannot act as.
_Avoid_: profile, login, identity, user

**User**:
The person at the browser. May hold several Accounts.
_Avoid_: account, member

**Active Account**:
The one Account the app currently acts as. Changing it changes whose data is
shown and who publishes.
_Avoid_: current user, logged-in user, session

**Account display**:
The Active Account as the UI shows it — npub, name, picture, nip05, and whether
its Session claims admin. Cached on the Account, so a screen renders it rather
than deriving it.
_Avoid_: current user, identity, profile

**Signer**:
The thing that produces signatures for an Account's pubkey. Most live outside the
app — a browser extension, a remote signer reached over NIP-46. One lives inside
it, holding the secret key.
_Avoid_: key, wallet, provider

**Remembered Account**:
An Account the User chose to keep on this device, so it survives closing the tab
and is listed when signing in again. A non-remembered Account lives only for the
current tab and is never listed. Decided per Account when it is added, not
globally.
_Avoid_: saved account, persistent login, remember me

**Anonymous browsing**:
Using Brainstorm with no Account at all. The only way to use it without an
identity.
_Avoid_: guest, readonly, logged out

### Keys and unlocking

**Backup**:
The portable, password-encrypted form of an Account's secret key. The same
artefact the app keeps at rest and the one the User exports, so an Account that
can be signed with is an Account that can be backed up.
_Avoid_: export, ncryptsec, recovery file

**Recovery password**:
The password that encrypts the Backup. Chosen by the User, never transmitted,
never stored.
_Avoid_: passphrase, PIN, master password

**Locked / Unlocked**:
States of an Account whose Signer holds the secret key. Locked means the app
knows the pubkey but cannot sign. Unlocking is a deliberate act by the User and
lasts for the current page load only. Accounts backed by an external Signer are
never Locked — their prompting is the Signer's business.
_Avoid_: authenticated, signed in, sealed

**Unlock cache**:
A device-bound copy of an already-unlocked key, kept so later page loads need no
Recovery password. Holds no authority the Backup does not already hold, and its
absence costs convenience only.
_Avoid_: vault, keystore, device key

### Sessions

**Session**:
The backend's acceptance of an Account, obtained by signing a challenge and held
as a bearer token. Per-Account and short-lived; refreshed by signing again, not
by a refresh token. Not the same as being signed in — the app can know its Active
Account while holding no valid Session.
_Avoid_: token, login, auth

### Not to be confused

**Perspective**:
Whose trust scores the User is looking at — the house's or their own. Orthogonal
to the Active Account: Perspective changes what you see, Active Account changes
who you are. Each Account keeps its own.
_Avoid_: POV, view, observer, lens
