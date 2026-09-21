import { useSyncExternalStore } from "react";

/**
 * How constrained the device says its network is. Read from the browser, never
 * chosen by the User: "slow" trims what loads on its own, "very slow" also
 * drops remote avatars. A browser that doesn't say is treated as normal, so
 * iOS — which exposes nothing — behaves as it always has.
 */
export type ConnectionSpeed = "normal" | "slow" | "very-slow";

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

function connection(): NetworkInformation | undefined {
  try {
    return (navigator as Navigator & { connection?: NetworkInformation }).connection;
  } catch {
    return undefined;
  }
}

function read(): ConnectionSpeed {
  const c = connection();
  if (!c) return "normal";
  // An explicit data-saver request outranks whatever the radio reports.
  if (c.saveData === true) return "very-slow";
  if (c.effectiveType === "2g" || c.effectiveType === "slow-2g") return "very-slow";
  if (c.effectiveType === "3g") return "slow";
  return "normal";
}

const listeners = new Set<() => void>();
let watching = false;

function onChange(): void {
  listeners.forEach((fn) => fn());
}

/** The current level. For code outside React; components use `useConnectionSpeed`. */
export const connectionSpeed = read;

// One "change" listener for the page, and one stable `subscribe` so React
// doesn't re-subscribe on every render of every consumer.
function subscribe(notify: () => void): () => void {
  if (!watching) {
    watching = true;
    connection()?.addEventListener?.("change", onChange);
  }
  listeners.add(notify);
  return () => void listeners.delete(notify);
}

const serverSnapshot = (): ConnectionSpeed => "normal";

/** The current level, re-rendering when the connection changes. */
export function useConnectionSpeed(): ConnectionSpeed {
  return useSyncExternalStore(subscribe, read, serverSnapshot);
}

/** Media only preloads on a connection that can afford it. */
export function videoPreload(speed: ConnectionSpeed): "metadata" | "none" {
  return speed === "normal" ? "metadata" : "none";
}

/** Test seam. */
export function __resetConnectionSpeed(): void {
  connection()?.removeEventListener?.("change", onChange);
  watching = false;
  listeners.clear();
}
