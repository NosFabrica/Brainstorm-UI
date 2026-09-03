import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import { installErrorBuffer } from "./lib/errorBuffer";
import "./index.css";

// From the first moment: support-ticket diagnostics can carry what the
// console said, but only if someone was listening when it broke.
installErrorBuffer();

if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
