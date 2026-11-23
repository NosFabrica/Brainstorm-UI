import { useCallback } from "react";
import { activePubkey } from "@/accounts/display";
import { deviceSetting, useDeviceSetting } from "@/hooks/deviceSetting";

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
 *   "tier"   — hue only: a tier-colored ring around the photo
 *   "word"   — the tier ring plus the tier WORD by the name, where it fits
 *   "off"    — no verification shown at all. Flag/report warnings are a
 *              separate safety channel and stay regardless
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
export type ScoreDisplayMode = "number" | "level" | "tier" | "word" | "off";

const STORAGE_KEY = "brainstorm_score_display";
const EVENT_NAME = "brainstorm-score-display-changed";

export const SCORE_DISPLAY_MODES: ScoreDisplayMode[] = ["number", "level", "tier", "word", "off"];

function isMode(v: unknown): v is ScoreDisplayMode {
  return (SCORE_DISPLAY_MODES as unknown[]).includes(v);
}

// Per-account (or "anon") so a second account on the same browser keeps its own
// choice. Pubkey read from the stored session directly to avoid a service
// import cycle — same trade `useActivePov` documents.
// Per-account (or "anon"). The Active Account is the source of truth since the
// accounts rework; the legacy `nostr_user` entry is read only as a fallback so
// a choice made before the migration isn't lost.
function scopedKey(): string {
  let who: string | null = null;
  try {
    who = activePubkey();
  } catch {}
  if (!who) {
    try {
      who = JSON.parse(localStorage.getItem("nostr_user") || "{}")?.pubkey || null;
    } catch {}
  }
  return `${STORAGE_KEY}:${who || "anon"}`;
}

function readStored(): ScoreDisplayMode | null {
  try {
    const v = localStorage.getItem(scopedKey());
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * The active mode; "word" until someone chooses otherwise. Decision 5 shipped
 * "number" as the default; the team review of the built modes (Aug 21)
 * superseded it — the ring + tier word is the product's face now, and the
 * 0–100 score is the opt-in for people who want the number.
 */
export function getScoreDisplayMode(): ScoreDisplayMode {
  return readStored() ?? "word";
}

export function setScoreDisplayMode(mode: ScoreDisplayMode): void {
  try {
    localStorage.setItem(scopedKey(), mode);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: mode }));
  } catch {}
}

const store = deviceSetting({ read: getScoreDisplayMode, storageKey: scopedKey, eventName: EVENT_NAME });

/** One store for every reader on the page (hooks/deviceSetting): one read, one pair of listeners. */
export function useScoreDisplayMode(): [ScoreDisplayMode, (mode: ScoreDisplayMode) => void] {
  const mode = useDeviceSetting(store);
  const update = useCallback((next: ScoreDisplayMode) => setScoreDisplayMode(next), []);
  return [mode, update];
}
