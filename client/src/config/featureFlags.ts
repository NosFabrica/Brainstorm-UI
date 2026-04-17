const boolEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off" || v === "") return false;
  return fallback;
};

export const FEATURES = {
  agentSuite: boolEnv(import.meta.env.VITE_FEATURE_AGENT_SUITE as string | undefined, false),
} as const;

export type FeatureFlag = keyof typeof FEATURES;
