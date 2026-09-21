import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { resolveHouseObserver } from "./services/trustSource";
import { startProfileCacheSync } from "./lib/profileCache";
import "./index.css";

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

// The relay refuses a lens-less read, so every search waits on this lookup.
// Asking now means the first search doesn't wait for it in series.
void resolveHouseObserver();

// Names and avatars learned this visit are kept for the next one (lib/profileCache).
startProfileCacheSync();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
