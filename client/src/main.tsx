import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { installErrorBuffer } from "./lib/errorBuffer";
import { startStoreHydration } from "./services/storeHydration";
import { resolveHouseObserver } from "./services/trustSource";
import { startRelayAuth } from "./services/relayAuth";
import { pool } from "./lib/relayPool";
import { accountManager } from "./accounts";
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

// Relays that gate reads behind a NIP-42 login: never waited on (lib/relayPool),
// answered with the account's signer when the reader allowed it (Settings).
startRelayAuth({ pool, active$: accountManager.active$ });

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
