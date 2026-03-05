export type TrustPreset = "relax" | "default" | "strict" | "custom";

const STORAGE_KEY = "brainstorm_trust_preset";
const CUSTOM_KEY = "brainstorm_trust_custom";

export const PRESET_THRESHOLDS: Record<Exclude<TrustPreset, "custom">, number> = {
  relax: 0.00,
  default: 0.02,
  strict: 0.15,
};

export function getActivePreset(): TrustPreset {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "relax" || stored === "default" || stored === "strict" || stored === "custom") return stored;
  return "default";
}

export function setActivePreset(preset: TrustPreset): void {
  localStorage.setItem(STORAGE_KEY, preset);
}

export function getCustomThreshold(): number | null {
  const stored = localStorage.getItem(CUSTOM_KEY);
  if (stored === null) return null;
  const val = parseFloat(stored);
  if (isNaN(val)) return null;
  return val;
}

export function setCustomThreshold(value: number | null): void {
  if (value === null) {
    localStorage.removeItem(CUSTOM_KEY);
  } else {
    localStorage.setItem(CUSTOM_KEY, String(Math.max(0, Math.min(1, value))));
  }
}

export function getVerifiedThreshold(): number {
  const preset = getActivePreset();
  if (preset === "custom") {
    const custom = getCustomThreshold();
    if (custom !== null) return custom;
    return PRESET_THRESHOLDS.default;
  }
  return PRESET_THRESHOLDS[preset];
}
