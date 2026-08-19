import { useCallback, useEffect, useState } from "react";

/**
 * How Verification Scores are displayed to THIS viewer, everywhere at once.
 *
 * Users told us that giving people a numbered score feels wrong. This is the
 * response, decided in docs/score-display/DECISIONS.md: a viewer-side display
 * choice — never a subject opt-out, which an open protocol cannot honor —
 * with three renderings of the ONE tier ladder:
 *
 *   "number" — today's display, digits on the coin          (default)
 *   "level"  — five pips that count the TIER, in tier hue
 *   "tier"   — hue and tier word only, no digits anywhere
 *
 * The constraint that keeps "level" honest: pips are derived from the tier,
 * never from score01. Five segments filled to score/100 would just be the
 * number in costume.
 *
 * Storage follows `useActivePov` deliberately — per-account localStorage plus
 * a same-tab custom event — because the two settings are siblings: both are
 * "how trust renders for me", both device-local until the NIP-78 prefs sync
 * exists, and a second pattern would be one pattern too many.
 */
export type ScoreDisplayMode = "number" | "level" | "tier";

const STORAGE_KEY = "brainstorm_score_display";
const EVENT_NAME = "brainstorm-score-display-changed";

export const SCORE_DISPLAY_MODES: ScoreDisplayMode[] = ["number", "level", "tier"];

function isMode(v: unknown): v is ScoreDisplayMode {
  return v === "number" || v === "level" || v === "tier";
}

// Per-account (or "anon") so a second account on the same browser keeps its own
// choice. Pubkey read from the stored session directly to avoid a service
// import cycle — same trade `useActivePov` documents.
function scopedKey(): string {
  let who = "anon";
  try { who = JSON.parse(localStorage.getItem("nostr_user") || "{}")?.pubkey || "anon"; } catch {}
  return `${STORAGE_KEY}:${who}`;
}

function readStored(): ScoreDisplayMode | null {
  try {
    const v = localStorage.getItem(scopedKey());
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

/** The active mode; "number" until someone chooses otherwise (decision 5). */
export function getScoreDisplayMode(): ScoreDisplayMode {
  return readStored() ?? "number";
}

export function setScoreDisplayMode(mode: ScoreDisplayMode): void {
  try {
    localStorage.setItem(scopedKey(), mode);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }));
  } catch {}
}

export function useScoreDisplayMode(): [ScoreDisplayMode, (m: ScoreDisplayMode) => void] {
  const [mode, setMode] = useState<ScoreDisplayMode>(() => getScoreDisplayMode());

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setMode(isMode(detail) ? detail : getScoreDisplayMode());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === scopedKey()) setMode(getScoreDisplayMode());
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((m: ScoreDisplayMode) => setScoreDisplayMode(m), []);
  return [mode, update];
}
