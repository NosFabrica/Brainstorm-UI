import { useCallback, useEffect, useState } from "react";
import { useActiveAccount } from "applesauce-react/hooks";

import { accountManager } from "@/accounts";
import { getMetadata, updateMetadata, type BrainstormAccount } from "@/accounts/metadata";

export type ActivePerspective = "nosfabrica" | "mywot";

/** Anonymous browsing has no Account to hang a Perspective on, so it keeps this row. */
/** Storage key and event name keep their v1 spelling — both are wire contracts. */
const ANON_KEY = "brainstorm_active_pov:anon";
const EVENT_NAME = "brainstorm-pov-changed";

function isPerspective(value: unknown): value is ActivePerspective {
  return value === "nosfabrica" || value === "mywot";
}

// Each Account keeps its own Perspective, so it rides on that Account's metadata
// rather than a pubkey-namespaced localStorage row — a second Account on the
// same browser can't inherit or overwrite the first one's.
function readStored(): ActivePerspective | null {
  const account = accountManager.active as BrainstormAccount | undefined;
  if (account) return getMetadata(account).perspective ?? null;
  try {
    const stored = localStorage.getItem(ANON_KEY);
    return isPerspective(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function getActivePerspective(): ActivePerspective {
  return readStored() ?? "nosfabrica";
}

export function hasStoredPerspective(): boolean {
  return readStored() !== null;
}

export function setActivePerspective(perspective: ActivePerspective): void {
  const account = accountManager.active as BrainstormAccount | undefined;
  if (account) updateMetadata(account, { perspective });
  else {
    try { localStorage.setItem(ANON_KEY, perspective); } catch { /* private browsing */ }
  }
  try { window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: perspective })); } catch {}
}

export function useActivePerspective(): [ActivePerspective, (p: ActivePerspective) => void] {
  const account = useActiveAccount();
  const [perspective, setPerspective] = useState<ActivePerspective>(() => getActivePerspective());

  useEffect(() => {
    // Switching Account switches Perspective with it.
    setPerspective(getActivePerspective());

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as ActivePerspective | undefined;
      setPerspective(isPerspective(detail) ? detail : getActivePerspective());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ANON_KEY) setPerspective(getActivePerspective());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [account?.id]);

  const update = useCallback((p: ActivePerspective) => setActivePerspective(p), []);
  return [perspective, update];
}
