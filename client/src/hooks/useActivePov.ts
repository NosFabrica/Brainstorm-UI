import { useCallback, useEffect, useState } from "react";

export type ActivePov = "nosfabrica" | "mywot";

const STORAGE_KEY = "brainstorm_active_pov";
const EVENT_NAME = "brainstorm-pov-changed";

function readStored(): ActivePov | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "nosfabrica" || v === "mywot" ? v : null;
  } catch {
    return null;
  }
}

export function getActivePov(): ActivePov {
  return readStored() ?? "nosfabrica";
}

export function setActivePov(pov: ActivePov): void {
  try {
    localStorage.setItem(STORAGE_KEY, pov);
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
      if (e.key === STORAGE_KEY) setPov(getActivePov());
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
