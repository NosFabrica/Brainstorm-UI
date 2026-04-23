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
