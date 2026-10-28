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
the Passwords app › Passkeys).

**No staging backend yet?** `npm run e2e:local -- --serve` runs the whole stack on
your machine; test at `http://localhost:5000`. On a Mac, turn off the AirPlay
Receiver first (System Settings › General › AirDrop & Handoff), which can hold
port 5000. Passkeys made for `localhost` sync like any other — delete them too.

**Devices.** iPhone Safari (iCloud Keychain) · the same iPhone with Brainstorm
installed to the home screen · Android Chrome (Google Password Manager) · Mac
Safari (Touch ID) · Windows Chrome (Windows Hello) · one third-party manager
(1Password or Bitwarden) · Firefox for Android. Chrome on a Mac saves passkeys to
iCloud Keychain unless the profile is signed in with sync on, or iCloud Keychain
is turned off in its password settings — only then does it offer Google Password
Manager.

**Clearing site data** (a "new device" without a second one): Safari › Settings ›
Privacy › Manage Website Data; Chrome › DevTools › Application › Storage › Clear
site data.

**An unlock that asks for the password** (for the offer rows): sign out from the
account menu, then on the login page drop the Unlock cache from the DevTools
console and pick the account. A private window won't do — it holds no account to
pick — and clearing site data takes the account with it.

```js
const k = "brainstorm_accounts_v2";
const a = JSON.parse(localStorage[k]);
a.forEach((x) => x.signer && delete x.signer.envelope);
localStorage[k] = JSON.stringify(a);
location.reload();
```

| Check                  | How                                                                            | Expect                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up                | Login → Create your account → a name → "Create with Face ID"                   | One prompt, or two in a row; "Protected with Face ID". Settings lists the passkey with "This device" — fine; only "This device only" means its copy hasn't reached the server |
| Reload                 | Reload, or close and reopen the tab                                            | Still signed in, no prompt                                                                                                                                                    |
| Second device          | Same Apple / Google account, another device: Login → "Sign in with Face ID"    | Signed in as the same account; Settings lists the passkey                                                                                                                     |
| Phone for a desktop    | Desktop Chrome: "Sign in with a passkey" → "use a phone" → scan with the phone | Signed in, or "That passkey can't unlock a key" — never a hang or a blank error                                                                                               |
| Offer                  | A password account, an unlock that asks for the password (above)               | "Skip the password next time?" → Turn on → one prompt → a toast                                                                                                               |
| Not now                | Same, answer "Not now", then unlock again                                      | No offer the second time                                                                                                                                                      |
| Settings add           | Settings › Add a passkey on an account that has none                           | A row with the provider's name ("iCloud Keychain", "Google Password Manager")                                                                                                 |
| Second on one provider | Add a passkey again on the same device                                         | The provider asks for Touch ID first, _then_ refuses; Settings shows "already has a passkey for this account" in the Passkeys section — and the first one still signs in      |
| Remove                 | Settings › Remove › Remove; then try the second device                         | Row gone; the second device says "Brainstorm has no copy for this passkey" and offers the key                                                                                 |
| Deleted in the manager | Delete the passkey in the password manager, then unlock in Brainstorm          | No error; the hint says it may have been deleted; password or key still works                                                                                                 |
| Cancel                 | Start any passkey prompt and dismiss it                                        | Back where you were, nothing red. Chrome on a Mac takes two dismissals: the iCloud sheet, then Chrome's "other ways" picker — the button waits until both are gone            |
| Installed app          | iPhone, Brainstorm on the home screen: sign in with Face ID                    | Works as in Safari (the app's storage is its own: it signs in as a new device)                                                                                                |
| No PRF                 | Firefox for Android                                                            | No passkey button on login, signup or Settings — a note in Settings instead                                                                                                   |

**Last run.** macOS 27, Touch ID, against the local stack ([#300](https://github.com/NosFabrica/Brainstorm-UI/pull/300#issuecomment-6471619281)):
Safari 27.0.1 and Chrome, both saving to iCloud Keychain — every row that one Mac
can run passes, and both return PRF at creation (one prompt at signup). Not yet
run: iPhone, Android, Windows, a third-party manager, Firefox for Android.
