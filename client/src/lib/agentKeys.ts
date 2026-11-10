/**
 * The user's AI agent keys (kind 12000, a draft NIP shared with Amethyst; Quartz's
 * `AgentKeyEvent`). A replaceable event whose content is NIP-44 encrypted to the
 * author: a JSON array of private tags, each `["key", <key>, <url>]`. The URL is the
 * root of an OpenAI-compatible API; the key is empty for a local runner that needs
 * none. The first well-formed `key` tag is the one apps use.
 *
 * Pure: parsing, the read-modify-write of the tag list, presets and display. The
 * relay and signer half is `services/agentKeys`.
 *
 * Never log a key. `maskKey` is the only way one reaches the screen.
 */

export const AGENT_KEYS_KIND = 12000;
export const AGENT_KEYS_ALT = "AI agent keys (encrypted)";
const KEY_TAG = "key";

export interface AgentKey {
  /** Sent as `Authorization: Bearer <key>`. Empty for an endpoint that needs none. */
  key: string;
  /** The API root: apps call `<url>/chat/completions` and `<url>/models`. */
  url: string;
}

const isKeyTag = (tag: unknown[]) => tag[0] === KEY_TAG;

function parseKeyTag(tag: string[]): AgentKey | null {
  if (tag.length < 3 || tag[0] !== KEY_TAG) return null;
  if (!tag[2] || !tag[2].trim()) return null;
  return { key: tag[1], url: tag[2] };
}

/** Every well-formed `key` tag, in the user's order of preference. */
export function parseAgentKeys(privateTags: string[][]): AgentKey[] {
  const out: AgentKey[] = [];
  for (const tag of privateTags) {
    const parsed = parseKeyTag(tag);
    if (parsed) out.push(parsed);
  }
  return out;
}

/** The decrypted content as a tag list, or null when it isn't one (never guess at it). */
export function decodePrivateTags(plaintext: string): string[][] | null {
  let value: unknown;
  try {
    value = JSON.parse(plaintext);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  if (!value.every((t) => Array.isArray(t) && t.every((v) => typeof v === "string"))) return null;
  return value as string[][];
}

/**
 * The new private tags: [keys] first, in order, then every tag that isn't a `key`,
 * untouched, so data another app keeps here survives this one's edit.
 */
export function withAgentKeys(privateTags: string[][], keys: AgentKey[]): string[][] {
  return [...keys.map((k) => [KEY_TAG, k.key, k.url]), ...privateTags.filter((t) => !isKeyTag(t))];
}

const same = (a: AgentKey, b: AgentKey) => a.key === b.key && a.url === b.url;

/** Adds [key] at the end; the first key a user saves is their preferred one. A duplicate changes nothing. */
export function addKey(keys: AgentKey[], key: AgentKey): AgentKey[] {
  return keys.some((k) => same(k, key)) ? keys : [...keys, key];
}

/** Moves [key] to the front, where apps look first. */
export function makePreferred(keys: AgentKey[], key: AgentKey): AgentKey[] {
  return [key, ...keys.filter((k) => !same(k, key))];
}

export function removeKey(keys: AgentKey[], key: AgentKey): AgentKey[] {
  return keys.filter((k) => !same(k, key));
}

export interface AgentPreset {
  id: string;
  name: string;
  /** Empty for Custom, which the user types. */
  url: string;
  /** A local runner: no key. */
  keyless?: boolean;
  recommended?: boolean;
  /** One line under the form when it matters. */
  note?: string;
  /**
   * The cheapest GET under `url` that fails on a bad key. Default `/models`; `null` where
   * every free call answers without looking at the key (checked 2026-11-10).
   */
  keyCheckPath?: string | null;
}

/** Which providers the form offers. Only the URL is stored; this list is display. */
export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    recommended: true,
    note: "One key reaches every major model, and you can cap what it spends.",
    // Its model list is public; `/key` describes the key and 401s on a bad one.
    keyCheckPath: "/key",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    url: "https://api.anthropic.com/v1",
    note: "Use an API key from the Claude Console. Claude Pro or Max sign-ins don't work here.",
  },
  { id: "openai", name: "OpenAI", url: "https://api.openai.com/v1" },
  { id: "gemini", name: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { id: "routstr", name: "Routstr", url: "https://api.routstr.com/v1", note: "Paid with Cashu, no account." },
  { id: "ppq", name: "PPQ.ai", url: "https://api.ppq.ai/v1", note: "Topped up with Lightning.", keyCheckPath: null },
  { id: "venice", name: "Venice", url: "https://api.venice.ai/api/v1", keyCheckPath: "/api_keys/rate_limits" },
  { id: "near", name: "NEAR AI", url: "https://cloud-api.near.ai/v1", keyCheckPath: "/users/me" },
  { id: "mistral", name: "Mistral", url: "https://api.mistral.ai/v1" },
  { id: "groq", name: "Groq", url: "https://api.groq.com/openai/v1" },
  { id: "xai", name: "xAI", url: "https://api.x.ai/v1" },
  { id: "deepseek", name: "DeepSeek", url: "https://api.deepseek.com/v1" },
  { id: "together", name: "Together", url: "https://api.together.xyz/v1" },
  { id: "fireworks", name: "Fireworks", url: "https://api.fireworks.ai/inference/v1" },
  { id: "cerebras", name: "Cerebras", url: "https://api.cerebras.ai/v1" },
  {
    id: "ollama",
    name: "Ollama",
    url: "http://localhost:11434/v1",
    keyless: true,
    note: "Runs on your computer. Works only there, and only once Ollama allows this site (OLLAMA_ORIGINS).",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    url: "http://localhost:1234/v1",
    keyless: true,
    note: "Runs on your computer. Works only there, with CORS turned on in LM Studio's server settings.",
  },
  { id: "custom", name: "Custom", url: "", note: "Any OpenAI-compatible API root, ending before /chat/completions." },
];

function parseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** The URL as stored: trimmed, no trailing slash. Null when it isn't an http(s) URL. */
export function normalizeAgentUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  return parseUrl(trimmed) ? trimmed : null;
}

/** A provider's name for a stored URL: the preset's when it is one, else its host. */
export function providerName(url: string): string {
  const u = parseUrl(url);
  if (!u) return url;
  const preset = AGENT_PRESETS.find((p) => p.url && parseUrl(p.url)?.host === u.host);
  return preset?.name ?? u.host;
}

/** `sk-or-…a1b2`: enough to tell two keys apart, never enough to use one. */
export function maskKey(key: string): string {
  if (!key) return "No key";
  if (key.length < 14) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function presetFor(url: string): AgentPreset | undefined {
  const host = parseUrl(url)?.host;
  return host ? AGENT_PRESETS.find((p) => p.url && parseUrl(p.url)?.host === host) : undefined;
}

/**
 * The request that tests a key: the preset's `keyCheckPath`, else `GET <url>/models`.
 * `keyChecked` is false for a provider whose free calls ignore the key. Anthropic only
 * answers a web page that says it means to call it directly, and wants a version.
 */
export function modelsRequest(entry: AgentKey): {
  url: string;
  headers: Record<string, string>;
  keyChecked: boolean;
} {
  const preset = presetFor(entry.url);
  const path = preset?.keyCheckPath ?? "/models";
  const keyChecked = preset?.keyCheckPath !== null;
  const headers: Record<string, string> = {};
  if (entry.key) headers.Authorization = `Bearer ${entry.key}`;
  if (parseUrl(entry.url)?.host === "api.anthropic.com") {
    if (entry.key) headers["x-api-key"] = entry.key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return { url: `${entry.url}${path}`, headers, keyChecked };
}

export type KeyTestResult =
  | { status: "ok"; models: number | null; unverified?: boolean }
  | { status: "rejected" }
  | { status: "failed"; httpStatus: number }
  | { status: "unreachable" };

/**
 * What an answer to `modelsRequest` means. xAI and Gemini answer a bad key with a 400
 * that says so, which counts as rejected.
 */
export function readTestAnswer(httpStatus: number, body: unknown, keyChecked = true): KeyTestResult {
  if (httpStatus === 401 || httpStatus === 403) return { status: "rejected" };
  if (httpStatus === 400 && /api key/i.test(JSON.stringify(body ?? ""))) return { status: "rejected" };
  if (httpStatus < 200 || httpStatus >= 300) return { status: "failed", httpStatus };
  const data = (body as { data?: unknown } | null)?.data ?? (body as { models?: unknown } | null)?.models;
  const models = Array.isArray(data) ? data.length : null;
  return keyChecked ? { status: "ok", models } : { status: "ok", models, unverified: true };
}
