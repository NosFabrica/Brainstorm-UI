type EnvKey =
  | "VITE_API_URL"
  | "VITE_NIP85_RELAY_URL"
  | "VITE_FEATURE_AGENT_SUITE"
  | "VITE_FEATURE_ASSISTANTS_ADMIN";

declare global {
  interface Window {
    __ENV__?: Partial<Record<EnvKey, string>>;
  }
}

function read(key: EnvKey): string | undefined {
  const fromWindow =
    typeof window !== "undefined" ? window.__ENV__?.[key] : undefined;
  // Treat unsubstituted placeholder ("__FOO__") as unset so dev fallback wins.
  if (fromWindow && !/^__.+__$/.test(fromWindow)) return fromWindow;
  const fromBuild = (import.meta.env as Record<string, string | undefined>)[key];
  return fromBuild;
}

export const env = {
  VITE_API_URL: read("VITE_API_URL") ?? "",
  VITE_NIP85_RELAY_URL: read("VITE_NIP85_RELAY_URL") ?? "",
  VITE_FEATURE_AGENT_SUITE: read("VITE_FEATURE_AGENT_SUITE") ?? "",
  VITE_FEATURE_ASSISTANTS_ADMIN: read("VITE_FEATURE_ASSISTANTS_ADMIN") ?? "",
} as const;

export {};
