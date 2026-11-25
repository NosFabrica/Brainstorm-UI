/**
 * What the Agent Suite page remembers on this device, per identity. Both rows
 * used to be one per browser (`brainstorm_agent_state`,
 * `brainstorm_previous_scores`), so a second Account on the device opened the
 * first one's assistant — its name, its picture, "active" — and its scores.
 */
export type AgentStatus = "dormant" | "activating" | "active" | "established" | "networked" | "trusted";

export interface AgentState {
  name: string;
  description: string;
  picture: string;
  banner: string;
  lud16: string;
  nip05: string;
  website: string;
  status: AgentStatus;
  activatedAt: number | null;
  publishedAt: number | null;
}

const LEGACY_AGENT_KEY = "brainstorm_agent_state";
const LEGACY_SCORES_KEY = "brainstorm_previous_scores";

export const agentStateKey = (pubkey: string) => `${LEGACY_AGENT_KEY}:${pubkey}`;
export const previousScoresKey = (pubkey: string) => `${LEGACY_SCORES_KEY}:${pubkey}`;

export function emptyAgentState(): AgentState {
  return {
    name: "",
    description: "",
    picture: "",
    banner: "",
    lud16: "",
    nip05: "",
    website: "",
    status: "dormant",
    activatedAt: null,
    publishedAt: null,
  };
}

function parseAgentState(stored: string): AgentState {
  const parsed = JSON.parse(stored);
  return {
    name: parsed.name || "",
    description: parsed.description || "",
    picture: parsed.picture || "",
    banner: parsed.banner || "",
    lud16: parsed.lud16 || "",
    nip05: parsed.nip05 || "",
    website: parsed.website || "",
    status: parsed.status || "dormant",
    activatedAt: parsed.activatedAt || null,
    publishedAt: parsed.publishedAt || null,
  };
}

/**
 * The unkeyed row from before, moved under `pubkey` — but only when this
 * device holds no other identity, since nothing in the row says whose it was.
 * With several held it is dropped: a guess would hand one person another's
 * assistant, and the page re-reads a real publish from the server anyway.
 */
function migrateLegacy(pubkey: string, soleIdentity: boolean): void {
  const legacy = localStorage.getItem(LEGACY_AGENT_KEY);
  if (legacy === null) return;
  if (soleIdentity && localStorage.getItem(agentStateKey(pubkey)) === null) {
    localStorage.setItem(agentStateKey(pubkey), legacy);
  }
  localStorage.removeItem(LEGACY_AGENT_KEY);
  localStorage.removeItem(LEGACY_SCORES_KEY);
}

export function readAgentState(pubkey: string | undefined, { soleIdentity }: { soleIdentity: boolean }): AgentState {
  if (!pubkey) return emptyAgentState();
  try {
    migrateLegacy(pubkey, soleIdentity);
    const stored = localStorage.getItem(agentStateKey(pubkey));
    if (stored) return parseAgentState(stored);
  } catch {}
  return emptyAgentState();
}

export function saveAgentState(pubkey: string | undefined, state: AgentState): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(agentStateKey(pubkey), JSON.stringify(state));
  } catch {}
}

export function readPreviousScores(pubkey: string | undefined): Map<string, number> {
  if (!pubkey) return new Map();
  try {
    const stored = localStorage.getItem(previousScoresKey(pubkey));
    if (stored) return new Map(JSON.parse(stored));
  } catch {}
  return new Map();
}

export function savePreviousScores(pubkey: string | undefined, scores: Map<string, number>): void {
  if (!pubkey) return;
  try {
    localStorage.setItem(previousScoresKey(pubkey), JSON.stringify(Array.from(scores.entries())));
  } catch {}
}

/**
 * A failed assistant publish, as the page says it. A 404/405 or a network
 * error used to read as "Assistant activated!" with the assistant marked
 * active, though nothing had reached the network. Every failure is a failure.
 */
export function publishFailure(error: Error, action: "activate" | "update"): { title: string; description: string } {
  const unreachable = /\b40[45]\b|Failed to fetch|NetworkError|Method Not Allowed/i.test(error.message);
  const what = action === "activate" ? "Your assistant wasn't activated" : "Your changes weren't published";
  return {
    title: action === "activate" ? "Activation failed" : "Update failed",
    description: unreachable
      ? `${what}: the server didn't accept the publish. Try again later.`
      : error.message || "Something went wrong.",
  };
}
