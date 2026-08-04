import { useCallback, useEffect, useState } from "react";

export type ActivePov = "nosfabrica" | "mywot";

const STORAGE_KEY = "brainstorm_active_pov";
const EVENT_NAME = "brainstorm-pov-changed";

// Per-account (or "anon") so a second account on the same browser keeps its own
// perspective instead of inheriting the previous account's. Pubkey read from the
// stored session directly to avoid a service import cycle.
function scopedKey(): string {
  let who = "anon";
  try { who = JSON.parse(localStorage.getItem("nostr_user") || "{}")?.pubkey || "anon"; } catch {}
  return `${STORAGE_KEY}:${who}`;
}

function readStored(): ActivePov | null {
  try {
    const v = localStorage.getItem(scopedKey());
    return v === "nosfabrica" || v === "mywot" ? v : null;
  } catch {
    return null;
  }
}

export function getActivePov(): ActivePov {
  return readStored() ?? "nosfabrica";
}

export function hasStoredPov(): boolean {
  return readStored() !== null;
}

export function setActivePov(pov: ActivePov): void {
  try {
    localStorage.setItem(scopedKey(), pov);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: pov }));
  } catch {}
}

export function useActivePov(): [ActivePov, (p: ActivePov) => void] {
  const [pov, setPov] = useState<ActivePov>(() => getActivePov());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as ActivePov | undefined;
      if (detail === "nosfabrica" || detail === "mywot") {
        setPov(detail);
      } else {
        setPov(getActivePov());
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === scopedKey()) setPov(getActivePov());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((p: ActivePov) => setActivePov(p), []);
  return [pov, update];
}
