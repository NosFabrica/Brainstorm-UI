export type TrustPreset = "relax" | "default" | "strict";

const STORAGE_KEY = "brainstorm_trust_preset";

export const PRESET_THRESHOLDS: Record<TrustPreset, number> = {
  relax: 0.00,
  default: 0.02,
  strict: 0.15,
};

export function getActivePreset(): TrustPreset {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "relax" || stored === "default" || stored === "strict") return stored;
  return "default";
}

export function setActivePreset(preset: TrustPreset): void {
  localStorage.setItem(STORAGE_KEY, preset);
}

export function getVerifiedThreshold(): number {
  return PRESET_THRESHOLDS[getActivePreset()];
}
