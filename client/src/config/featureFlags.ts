import { env } from "@/lib/runtimeEnv";

const boolEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off" || v === "") return false;
  return fallback;
};

export const FEATURES = {
  agentSuite: boolEnv(env.VITE_FEATURE_AGENT_SUITE, false),
  assistantsAdmin: boolEnv(env.VITE_FEATURE_ASSISTANTS_ADMIN, false),
} as const;

export type FeatureFlag = keyof typeof FEATURES;
