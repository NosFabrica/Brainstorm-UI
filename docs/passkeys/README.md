# Passkeys — the screens

The design the passkey work was built from (ADR [0009](../adr/0009-passkey-unlocks-a-held-key.md)).
Testing: `npm run e2e:local` (every flow, real backend, here), `e2e/passkeys.spec.ts` (staging), and the
[real-device checklist](../agents/passkey-checklist.md).

Mockups, not captures: copy and spacing in the shipped components follow them, and where they differ
the components win.

|                                                         |                                                           |
| ------------------------------------------------------- | --------------------------------------------------------- |
| [01 Login on a new device](screenshots/01-login.jpg)    | "Sign in with Face ID" leads where the browser can do PRF |
| [02 The system sheet](screenshots/02-passkey-sheet.jpg) | Drawn by the OS, not by us                                |
| [03 Account picker](screenshots/03-account-picker.jpg)  | A key that opens with a passkey wears its name            |
| [04 Create account](screenshots/04-create-account.jpg)  | A name and one prompt; the password one tap away          |
| [05 Created](screenshots/05-created.jpg)                | Where the passkey works next                              |
| [06 Backup step](screenshots/06-backup-step.jpg)        | The Backup is still asked for — a passkey isn't one       |
| [07 Unlock](screenshots/07-unlock.jpg)                  | The passkey first, the Recovery password behind a link    |
| [08 The offer](screenshots/08-offer.jpg)                | Once, right after a password unlock                       |
| [09 Settings](screenshots/09-settings.jpg)              | Every device's passkeys, added and removed here           |
| [10 Edge states](screenshots/10-edge-states.jpg)        | Not ready, unsupported, no PRF, removing the last one     |
