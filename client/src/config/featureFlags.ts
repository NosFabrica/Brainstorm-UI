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

/** Staging's two hosts (SECURITY.md). Production is every host not named here, so an unlisted one stays off. */
const STAGING_HOSTS = ["brainstorm-staging.nosfabrica.com", "brainstorm-staging.relay.tools"];

/**
 * Whether this page is staging or a local copy: for work staging shows and
 * production doesn't yet. Decided by the page's own host, so it ships with the
 * UI image and needs no deployment setting.
 */
export function onStagingHost(host = typeof window !== "undefined" ? window.location.hostname : ""): boolean {
  return STAGING_HOSTS.includes(host) || host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}

export const FEATURES = {
  agentSuite: boolEnv(env.VITE_FEATURE_AGENT_SUITE, false),
  assistantsAdmin: boolEnv(env.VITE_FEATURE_ASSISTANTS_ADMIN, false),
  /**
   * All's tag filters and the tabs of the tags the words name. Staging only: the
   * filters are found among the results loaded so far, not every result, and
   * that can't ship to production (2026-11-18). Delete the host check to ship.
   */
  searchTagFilters: onStagingHost(),
} as const;

export type FeatureFlag = keyof typeof FEATURES;
