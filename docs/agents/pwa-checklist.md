# Installed app (PWA): real-device checklist

The unit tests and `e2e/installed-app.spec.ts` cover what a desktop Chromium can
emulate. These can't be: run them on staging, on a real iPhone (Safari) and a
real Android phone (Chrome), after a change to the manifest, `index.html`'s
head, the service worker, notifications or the resume path.

Install first: iPhone — Share → Add to Home Screen; Android — the account
menu's "Install the app", or Chrome's ⋮ → Install app.

| Check                | How                                                              | Expect                                                                                             |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Icon and name        | Look at the home screen                                          | The B tile, no black corners (iOS), not shrunk inside a white circle (Android); label "Brainstorm" |
| Launch screen        | Cold-launch the app                                              | White with the B tile (iOS), no blank flash                                                        |
| Status bar           | Open the app; switch the theme in the account menu               | The bar matches the page, light and dark                                                           |
| Offline launch       | Use it once, close it, airplane mode, open it                    | The search home renders; Messages shows cached chats                                               |
| Long absence         | Leave it in the background 15+ min, return                       | Relays reconnect within seconds; the dashboard refreshes                                           |
| Message notification | Signed in, app in the background, get a DM from a second account | Notification on the tray; tapping it opens that chat                                               |
| Icon badge           | Unread DMs, app in the background                                | The count on the icon (iOS needs notifications allowed)                                            |
| Signer round-trip    | Sign in with a signer app (nsec.app / Amber bunker)              | Back in the app, signed in                                                                         |
| Back                 | Search → open a profile                                          | A Back arrow in the header returns to the results                                                  |
| Share into the app   | Android: share an njump.me link from another app to Brainstorm   | Opens that note or profile                                                                         |
| Update               | Keep the app open across a staging deploy, then return to it     | "A new version is ready · Reload" (or nothing, if it relaunched onto the new build)                |
| Shortcuts            | Android: long-press the icon                                     | Search, Messages, Dashboard                                                                        |

Desktop Chrome: install from the address bar's install icon and check offline
launch, the update prompt and notifications the same way.
