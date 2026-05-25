import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const notify = () => {
  listeners.forEach((l) => l());
};

export function openMobileMenu() {
  if (open) return;
  open = true;
  notify();
}

export function closeMobileMenu() {
  if (!open) return;
  open = false;
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return open;
}

export function useMobileMenuOpen() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
