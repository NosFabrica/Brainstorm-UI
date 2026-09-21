import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { startStoreHydration } from "./services/storeHydration";
import { resolveHouseObserver } from "./services/trustSource";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
