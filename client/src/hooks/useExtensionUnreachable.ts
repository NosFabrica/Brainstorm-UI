import { useEffect, useState } from "react";
import { EXTENSION_COLD_BOOT_WAIT_MS, waitForExtension } from "@/accounts/login";
import { isInstalledPhoneApp } from "@/lib/installedApp";

const hasExtension = () => typeof window !== "undefined" && !!(window as { nostr?: unknown }).nostr;

/**
 * True when signing in with an extension can't work here: an app installed to a
 * phone's home screen with no extension in it. Decided by the extension itself, not
 * the platform — Chrome's installed app has none, but Firefox and Edge on Android run
 * add-ons, and an app installed from them may carry one. Extensions inject late on a
 * cold start, so one that turns up within the cold-boot wait brings its button back.
 */
export function useExtensionUnreachable(): boolean {
  const [unreachable, setUnreachable] = useState(() => isInstalledPhoneApp() && !hasExtension());
  useEffect(() => {
    if (!unreachable) return;
    let live = true;
    void waitForExtension(EXTENSION_COLD_BOOT_WAIT_MS).then((found) => live && found && setUnreachable(false));
    return () => {
      live = false;
    };
  }, [unreachable]);
  return unreachable;
}
