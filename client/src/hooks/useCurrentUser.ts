import { useEffect, useState } from "react";
import { getCurrentUser, type NostrUser } from "@/services/nostr";
import { USER_CHANGED_EVENT } from "@/lib/assistantStorage";

/**
 * Live current-user state for header/menu components.
 *
 * Initializes from `getCurrentUser()` and re-reads whenever a
 * `brainstorm-user-changed` event fires — e.g. when the profile metadata
 * (avatar / displayName) arrives shortly after login. Without this, a header
 * that read the user only once on mount would keep showing the "Anon" / "U"
 * fallback until the page was refreshed or navigated.
 *
 * Returns a `[user, setUser]` tuple so callers can still set the value
 * manually (e.g. clearing it on logout).
 */
export function useCurrentUser(): [
  NostrUser | null,
  React.Dispatch<React.SetStateAction<NostrUser | null>>,
] {
  const [user, setUser] = useState<NostrUser | null>(() => getCurrentUser());

  useEffect(() => {
    const sync = () => {
      const fresh = getCurrentUser();
      setUser((prev) => {
        if (!fresh) return null;
        return prev ? { ...prev, ...fresh } : fresh;
      });
    };

    // Re-sync once on mount: the login-time profile fetch can resolve in the
    // gap between the initial render and this effect attaching its listener.
    sync();

    window.addEventListener(USER_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(USER_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return [user, setUser];
}
