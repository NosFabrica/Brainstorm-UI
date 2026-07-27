import { useSyncExternalStore } from "react";

/**
 * Open-state for the mobile account bottom sheet, kept outside React so the
 * "You" tab in {@link MobileTabBar} and any other trigger can open it without
 * prop-drilling. Mirrors mobileMenuStore's shape.
 */
let open = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function openAccountSheet() {
  if (open) return;
  open = true;
  notify();
}

export function closeAccountSheet() {
  if (!open) return;
  open = false;
  notify();
}

export function setAccountSheet(next: boolean) {
  if (open === next) return;
  open = next;
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useAccountSheetOpen() {
  return useSyncExternalStore(subscribe, () => open, () => open);
}
