/**
 * The unread count on the app's icon — the home screen, the dock, the taskbar.
 * Only an installed app has an icon to badge: iOS 16.4+ (once notifications are
 * allowed), Chrome and Edge on the desktop, some Android launchers. Elsewhere
 * the call is missing or refused, and the title count (lib/titleBadge) is it.
 */
type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

let shown = 0;

export function setAppBadge(n: number): void {
  if (typeof navigator === "undefined") return;
  const count = Math.max(0, Math.floor(n));
  if (count === shown) return;
  shown = count;
  const nav = navigator as BadgeNavigator;
  const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  // Refused (no permission, not installed): nothing to show it on.
  void done?.catch(() => {});
}

/** Test seam. */
export function __resetAppBadge(): void {
  shown = 0;
}
