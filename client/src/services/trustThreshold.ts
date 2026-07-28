export type TrustPreset = "relax" | "default" | "strict";

const STORAGE_KEY = "brainstorm_trust_preset";
const LEGACY_CUSTOM_KEY = "brainstorm_trust_custom";

try {
  if (typeof localStorage !== "undefined" && localStorage.getItem(LEGACY_CUSTOM_KEY) !== null) {
    localStorage.removeItem(LEGACY_CUSTOM_KEY);
  }
} catch {}

// No flat per-preset "verified threshold" here, deliberately: a preset carries
// three per-relationship cutoffs (follower / muter / reporter) that the server
// resolves, and flattening them to one number is what made the page disagree
// with the profile's published Trusted Assertion. Ask the backend — section
// counts from /stats, per-row verdicts from `verified`/`tier` on /connections.

// The DEFAULT preset's follower cutoff, mirroring `DEFAULT_VERIFIED_THRESHOLD`
// in `app/core/tier_thresholds.py`. ONLY for badges handed a bare score with no
// observer context (note cards, search rows, OG images) — there's no response to
// read a `verified`/`tier` off. Wherever the backend can answer, use its answer.
export const DEFAULT_VERIFIED_LINE = 0.02;

// Tier-band lower bounds. Keys match the GR `count_values` / backend
// `ConnectionTierCounts` bucket names — each value is the lower bound of
// the bucket it names (influence >= TIER_THRESHOLDS.high → tier "high",
// >= .medium_high → tier "medium_high", etc.). Kept in sync with
// `app/core/tier_thresholds.py` on the backend. Fixed, not preset-driven —
// the preset moves the verified line under them, which is the server's call.
export const TIER_THRESHOLDS = {
  high: 0.50,
  medium_high: 0.20,
  medium: 0.07,
} as const;

// Single source of truth for trust-tier colors — shared by the dashboard's
// Network Composition breakdown and the public-page Web of Trust bar so the two
// can never drift. Keep these in sync with nothing else: everything reads here.
export const TRUST_TIER_COLORS = {
  highlyTrusted: "#059669", // emerald
  trusted: "#0ea5e9", // sky
  neutral: "#6366f1", // indigo
  lowTrust: "#f59e0b", // amber
  unverified: "#a1a1aa", // zinc
  flagged: "#ef4444", // red (public pages surface this as the flag banner, not a bar segment)
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
