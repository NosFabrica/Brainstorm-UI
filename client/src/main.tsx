import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { startStoreHydration } from "./services/storeHydration";
import "./index.css";

// Before the first render, not in an effect: by the time effects run, the
// queries this exists to satisfy have already gone to the relays.
startStoreHydration();

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
