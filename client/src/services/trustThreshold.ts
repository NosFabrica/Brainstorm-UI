export type TrustPreset = "relax" | "default" | "strict";

const STORAGE_KEY = "brainstorm_trust_preset";
const LEGACY_CUSTOM_KEY = "brainstorm_trust_custom";

try {
  if (typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_CUSTOM_KEY) !== null) {
    localStorage.removeItem(LEGACY_CUSTOM_KEY);
  }
} catch {}

export const PRESET_THRESHOLDS: Record<TrustPreset, number> = {
  relax: 0.00,
  default: 0.02,
  strict: 0.15,
};

// Tier-band lower bounds. Keys match the GR `count_values` / backend
// `ConnectionTierCounts` bucket names — each value is the lower bound of
// the bucket it names (influence >= TIER_THRESHOLDS.high → tier "high",
// >= .medium_high → tier "medium_high", etc.). Kept in sync with
// `app/core/tier_thresholds.py` on the backend.
// Currently NOT preset-driven — only verified_threshold (above) moves with
// preset.
export const TIER_THRESHOLDS = {
  high: 0.50,
  medium_high: 0.20,
  medium: 0.07,
} as const;

// Single source of truth for trust-tier colors — shared by the dashboard's
// Network Composition breakdown and the public-page Web of Trust bar so the two
// can never drift. Keep these in sync with nothing else: everything reads here.
// Brand-aligned trust ramp (Design System v1.0): the two highest tiers use the
// brand's Aurora Purple → Aurora Cyan (purple & cyan are "reserved for trust,
// interaction and focus"); neutral is a muted brand violet; the low/flagged
// tiers keep their semantic warning hues (amber/red) and unverified is a brand
// grey. Single source of truth — dashboard Network Composition, the WoT bar, and
// the VerificationCoin all read here.
export const TRUST_TIER_COLORS = {
  highlyTrusted: "#7237ff", // Aurora Purple
  trusted: "#13d2e5", // Aurora Cyan
  neutral: "#665487", // Muted Violet
  lowTrust: "#f59e0b", // amber (semantic caution — unchanged)
  unverified: "#8c929e", // Neutral Grey (brand)
  flagged: "#ef4444", // red (semantic danger — unchanged; public pages surface this as the flag banner)
} as const;

const BACKEND_TO_PRESET: Record<string, TrustPreset> = {
  PERMISSIVE: "relax",
  DEFAULT: "default",
  RESTRICTIVE: "strict",
};

const PRESET_TO_BACKEND: Record<TrustPreset, "PERMISSIVE" | "DEFAULT" | "RESTRICTIVE"> = {
  relax: "PERMISSIVE",
  default: "DEFAULT",
  strict: "RESTRICTIVE",
};

export function presetFromBackend(value: string | null | undefined): TrustPreset {
  if (!value) return "default";
  const upper = value.toUpperCase();
  return BACKEND_TO_PRESET[upper] ?? "default";
}

export function presetToBackend(preset: TrustPreset): "PERMISSIVE" | "DEFAULT" | "RESTRICTIVE" {
  return PRESET_TO_BACKEND[preset];
}

export function getActivePreset(): TrustPreset {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "relax" || stored === "default" || stored === "strict") return stored;
  } catch {}
  return "default";
}

export function setActivePreset(preset: TrustPreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, preset);
  } catch {}
}

export function getVerifiedThreshold(): number {
  return PRESET_THRESHOLDS[getActivePreset()];
}

const PRESET_DISPLAY_LABEL: Record<TrustPreset, string> = {
  relax: "Relax",
  default: "Default",
  strict: "Strict",
};

export function presetDisplayLabel(preset: TrustPreset): string {
  return PRESET_DISPLAY_LABEL[preset];
}

export function presetDisplayLabelFromBackend(value: string | null | undefined): string | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (!(upper in BACKEND_TO_PRESET)) return null;
  return PRESET_DISPLAY_LABEL[BACKEND_TO_PRESET[upper]];
}
