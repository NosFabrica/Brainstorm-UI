import { env } from "@/lib/runtimeEnv";

/**
 * An EMPTY value means UNSET, not `false`.
 *
 * `runtimeEnv` coerces every missing key to `""`, never `undefined`, so
 * treating `""` as an explicit `false` made the `fallback` argument
 * unreachable for every VITE_* flag in this app — a flag that needed to
 * default ON silently stayed off. Only an explicit falsey word turns a flag
 * off; anything else falls through to the fallback.
 */
export const boolEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return true;
  if (v === "false" || v === "0" || v === "no" || v === "off") return false;
  return fallback;
};

export const FEATURES = {
  agentSuite: boolEnv(env.VITE_FEATURE_AGENT_SUITE, false),
  assistantsAdmin: boolEnv(env.VITE_FEATURE_ASSISTANTS_ADMIN, false),
} as const;

export type FeatureFlag = keyof typeof FEATURES;
