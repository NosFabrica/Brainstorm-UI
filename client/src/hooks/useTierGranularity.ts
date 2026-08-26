import { useCallback, useEffect, useState } from "react";
import { activePubkey } from "@/accounts/display";
import type { Granularity } from "@/lib/trustLadder";

/**
 * How many rungs the trust ladder has for THIS viewer — "simple" (verified /
 * unknown / flagged) or "detailed" (five tiers + flagged). Decision 6 and 8 in
 * docs/trust-tiers/DECISIONS.md: a data choice independent of the display mode,
 * defaulting to Simple for everyone, existing users included.
 *
 * Same store pattern as `useScoreDisplayMode`, on purpose: per-account
 * localStorage, a same-tab custom event, a cross-tab `storage` listener. The
 * two settings are siblings under Trust Perspective and must behave alike.
 */
const STORAGE_KEY = "brainstorm_tier_granularity";
const EVENT_NAME = "brainstorm-tier-granularity-changed";

export const GRANULARITIES: Granularity[] = ["simple", "detailed"];

function isGranularity(v: unknown): v is Granularity {
  return (GRANULARITIES as unknown[]).includes(v);
}

// Per-account (or "anon"). The Active Account is the source of truth since the
// accounts rework; the legacy `nostr_user` entry is read only as a fallback so
// a choice made before the migration isn't lost.
function scopedKey(): string {
  let who: string | null = null;
  try { who = activePubkey(); } catch {}
  if (!who) {
    try { who = JSON.parse(localStorage.getItem("nostr_user") || "{}")?.pubkey || null; } catch {}
  }
  return `${STORAGE_KEY}:${who || "anon"}`;
}

function readStored(): Granularity | null {
  try {
    const v = localStorage.getItem(scopedKey());
    return isGranularity(v) ? v : null;
  } catch {
    return null;
  }
}

export function getTierGranularity(): Granularity {
  return readStored() ?? "simple";
}

export function setTierGranularity(g: Granularity): void {
  try {
    localStorage.setItem(scopedKey(), g);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: g }));
  } catch {}
}

export function useTierGranularity(): [Granularity, (g: Granularity) => void] {
  const [g, setG] = useState<Granularity>(() => getTierGranularity());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setG(isGranularity(detail) ? detail : getTierGranularity());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === scopedKey()) setG(getTierGranularity());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((next: Granularity) => setTierGranularity(next), []);
  return [g, update];
}
