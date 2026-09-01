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
  // Defaults ON: this only chooses the local mock over the real server, and a
  // developer convenience must not be something a deployment has to remember —
  // forgetting it fails invisibly, serving fabricated subscription state that
  // looks like working software. Set VITE_FEATURE_SUBSCRIPTION_API=false in
  // client/.env to work against the mock, which is also the only free way to
  // see past_due, grace and canceled given there is no Flash sandbox.
  subscriptionApi: boolEnv(env.VITE_FEATURE_SUBSCRIPTION_API, true),
} as const;

export type FeatureFlag = keyof typeof FEATURES;
