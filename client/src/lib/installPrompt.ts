/**
 * Offering to install the app. Two ways it can go:
 *
 *   - "prompt": Chrome, Edge and Samsung Internet hand over an install prompt
 *     (`beforeinstallprompt`) that a button can open. It fires early and once,
 *     so it is caught at boot (`startInstallPrompt`, from main.tsx) and kept.
 *   - "ios": Safari has no prompt to open; the reader adds the app from the
 *     Share sheet, so the offer is the steps to get there.
 *
 * Neither once the app is installed, or running as the installed app.
 */
import { useSyncExternalStore } from "react";
import { isInstalledApp } from "./installedApp";
import { isIOS } from "./platform";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallOffer = "prompt" | "ios" | null;

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function startInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Kept for our own button instead of the browser's mini-infobar.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function installOffer(): InstallOffer {
  if (installed || isInstalledApp()) return null;
  if (deferred) return "prompt";
  return isIOS() ? "ios" : null;
}

/** Open the browser's install prompt. Resolves whether the reader installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // A prompt opens once: the browser fires a fresh event if it can offer again.
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

export function useInstallOffer(): InstallOffer {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    installOffer,
    () => null,
  );
}

/** Test seam. */
export function __resetInstallPrompt(): void {
  deferred = null;
  installed = false;
  listeners.clear();
}
