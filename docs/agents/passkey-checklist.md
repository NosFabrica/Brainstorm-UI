# Passkeys: real-device checklist

`npm run e2e:local` drives every passkey flow against the real stack, and
`e2e/passkeys.spec.ts` repeats the round trip on staging — both with Chromium's
virtual authenticator, which behaves like a well-mannered provider and nothing
else. What only real devices answer: whether each provider hands over PRF (at
creation or only on a second prompt), whether Safari lets the second prompt run,
and whether a synced passkey really signs in elsewhere. Run these on staging
after a change to `accounts/passkey*.ts`, the unlock or signup flow, or the
backend's `/passkeyVault`. Design: [ADR 0009](../adr/0009-passkey-unlocks-a-held-key.md).

**Before you start.** Staging's backend has the passkey vault, and its
`PASSKEY_ORIGINS` (or `FRONTEND_URL`) is the staging UI's origin. Use throwaway
accounts — never your real key. Delete their passkeys from the password manager
afterwards (iOS: Settings › Passwords; Android: Google Password Manager; macOS:
Passwords).

**Devices.** iPhone Safari (iCloud Keychain) · the same iPhone with Brainstorm
installed to the home screen · Android Chrome (Google Password Manager) · Mac
Safari (Touch ID) · Windows Chrome (Windows Hello) · one third-party manager
(1Password or Bitwarden) · Firefox for Android.

| Check                  | How                                                                              | Expect                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Sign up                | Login → Create your account → a name → "Create with Face ID"                     | One prompt, or two in a row; "Protected with Face ID"; Settings lists the passkey, not "This device only" |
| Reload                 | Reload, or close and reopen the tab                                              | Still signed in, no prompt                                                                                |
| Second device          | Same Apple / Google account, another device: Login → "Sign in with Face ID"      | Signed in as the same account; Settings lists the passkey                                                 |
| Phone for a desktop    | Desktop Chrome: "Sign in with a passkey" → "use a phone" → scan with the phone   | Signed in, or "That passkey can't unlock a key" — never a hang or a blank error                           |
| Offer                  | A password account, no Unlock cache (private window): pick it, type the password | "Skip the password next time?" → Turn on → one prompt → a toast                                           |
| Not now                | Same, answer "Not now", then unlock again                                        | No offer the second time                                                                                  |
| Settings add           | Settings › Add a passkey on an account that has none                             | A row with the provider's name ("iCloud Keychain", "Google Password Manager")                             |
| Second on one provider | Add a passkey again on the same device                                           | "Your password manager already has a passkey for this account" — and the first one still signs in         |
| Remove                 | Settings › Remove › Remove; then try the second device                           | Row gone; the second device says "This passkey isn't ready for new devices"                               |
| Deleted in the manager | Delete the passkey in the password manager, then unlock in Brainstorm            | No error; the hint says it may have been deleted; password or key still works                             |
| Cancel                 | Start any passkey prompt and dismiss it                                          | Back where you were, nothing red                                                                          |
| Installed app          | iPhone, Brainstorm on the home screen: sign in with Face ID                      | Works as in Safari (the app's storage is its own: it signs in as a new device)                            |
| No PRF                 | Firefox for Android                                                              | No passkey button on login, signup or Settings — a note in Settings instead                               |
