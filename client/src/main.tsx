import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { installErrorBuffer } from "./lib/errorBuffer";
import { startStoreHydration } from "./services/storeHydration";
import { resolveHouseObserver } from "./services/trustSource";
import { startRelayAuth } from "./services/relayAuth";
import { startDirectMessages } from "./services/dm";
import { pool } from "./lib/relayPool";
import { SEARCH_RELAY } from "./lib/relays";
import { warmSearchRelay } from "./lib/searchRelay";
import { accountManager } from "./accounts";
import { canSignSilently, signAs } from "./accounts/signing";
import { signerSaidNo } from "./accounts/signer-errors";
import { registerServiceWorker } from "./lib/serviceWorker";
import { startAppResume } from "./services/appResume";
import { keepStorageForInstalledApp } from "./lib/persistentStorage";
import { startInstallPrompt } from "./lib/installPrompt";
// Brand fonts, bundled: Figtree (interface, upright and italic) + IBM Plex Mono
// (technical/metadata). Each face's subsets load only when a page uses them.
import "@fontsource-variable/figtree/wght.css";
import "@fontsource-variable/figtree/wght-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import "./index.css";

// From the first moment: support-ticket diagnostics can carry what the
// console said, but only if someone was listening when it broke.
installErrorBuffer();

// Before the first render, not in an effect: by the time effects run, the
// queries this exists to satisfy have already gone to the relays. Restores the
// active account's routing events and starts keeping what this visit learns —
// names, avatars and relay lists alike (lib/eventCache).
startStoreHydration();

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

// The relay refuses a lens-less read, so every search waits on this lookup.
// Asking now means the first search doesn't wait for it in series.
void resolveHouseObserver();

// The search socket opens now, not when the first search mounts: its handshake (and,
// signed in, its NIP-42 login below) overlaps the app's own start instead of standing
// in front of the first REQ.
warmSearchRelay();

// Relays that gate reads or writes behind a NIP-42 login: never waited on
// (lib/relayPool), answered with the account's signer wherever they ask.
// Never with our Unlock modal unless the reader is in Messages.
startRelayAuth({
  pool,
  active$: accountManager.active$,
  canSignQuietly: canSignSilently,
  sign: signAs,
  // Only the reader's own "no" is a rejection; a missing or silent signer is worth another go.
  isRejection: signerSaidNo,
  // Our own search relay: signed in up front, the moment it challenges — before any read
  // is refused — so a search never waits on a refusal and a login round trip.
  upFront: [SEARCH_RELAY],
});

// Private messages (NIP-17) follow the Active Account from sign-in, not from the
// first visit to Messages: the live subscription warms the inbox and the unread
// badge while the reader is elsewhere (services/dm).
startDirectMessages();

// The installed app's offline shell, its updates and its notifications (lib/serviceWorker).
registerServiceWorker();

// Chrome's install prompt fires once, early: kept for the account menu's "Install the app".
startInstallPrompt();

// Back from the background: reconnect, look for a deploy, refresh what went stale.
startAppResume();

// Signed in to the installed app: its account and caches are worth keeping through
// a device's storage clean-up (lib/persistentStorage).
accountManager.active$.subscribe((account) => {
  if (account) keepStorageForInstalledApp();
});

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
