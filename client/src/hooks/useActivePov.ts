import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";

import { accountManager } from "@/accounts";
import { getMetadata, updateMetadata, type BrainstormAccount } from "@/accounts/metadata";

export type ActivePov = "nosfabrica" | "mywot";

/** Anonymous browsing has no Account to hang a Perspective on, so it keeps this row. */
const ANON_KEY = "brainstorm_active_pov:anon";
const EVENT_NAME = "brainstorm-pov-changed";

function isPov(value: unknown): value is ActivePov {
  return value === "nosfabrica" || value === "mywot";
}

// Each Account keeps its own Perspective, so it rides on that Account's metadata
// rather than a pubkey-namespaced localStorage row — a second Account on the
// same browser can't inherit or overwrite the first one's.
function readStored(): ActivePov | null {
  const account = accountManager.active as BrainstormAccount | undefined;
  if (account) return getMetadata(account).perspective ?? null;
  try {
    const stored = localStorage.getItem(ANON_KEY);
    return isPov(stored) ? stored : null;
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
  const account = accountManager.active as BrainstormAccount | undefined;
  if (account) updateMetadata(account, { perspective: pov });
  else {
    try { localStorage.setItem(ANON_KEY, pov); } catch { /* private browsing */ }
  }
  try { window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: pov })); } catch {}
}

export function useActivePov(): [ActivePov, (p: ActivePov) => void] {
  const account = useActiveAccount();
  const [pov, setPov] = useState<ActivePov>(() => getActivePov());

  useEffect(() => {
    // Switching Account switches Perspective with it.
    setPov(getActivePov());

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as ActivePov | undefined;
      setPov(isPov(detail) ? detail : getActivePov());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ANON_KEY) setPov(getActivePov());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [account?.id]);

  const update = useCallback((p: ActivePov) => setActivePov(p), []);
  return [pov, update];
}
