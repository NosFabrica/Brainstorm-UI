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
const KEY_TAG = "key";

export interface AgentKey {
  /** Sent as `Authorization: Bearer <key>`. Empty for an endpoint that needs none. */
  key: string;
  /** The API root: apps call `<url>/chat/completions` and `<url>/models`. Use `apiRoot`. */
  url: string;
  /** Values after the URL another app wrote: carried through a rewrite, never read. */
  extra?: string[];
}

function parseKeyTag(tag: string[]): AgentKey | null {
  if (tag.length < 3 || tag[0] !== KEY_TAG) return null;
  if (!tag[2] || !tag[2].trim()) return null;
  // A key never travels in cleartext: such a tag is not used, only kept.
  if (!isSecureAgentUrl(tag[2], tag[1])) return null;
  return tag.length > 3 ? { key: tag[1], url: tag[2], extra: tag.slice(3) } : { key: tag[1], url: tag[2] };
}

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

/**
 * NIP-FA: the URL is `https`, except for a loopback host or when there is no key to
 * protect. Anything else would send the key in the clear.
 */
export function isSecureAgentUrl(url: string, key: string): boolean {
  const u = parseUrl(url.trim());
  if (!u) return false;
  return u.protocol === "https:" || !key || LOOPBACK.test(u.hostname);
}

/** Where to call: the stored URL without its one trailing `/` (NIP-FA readers strip one). */
export function apiRoot(url: string): string {
  return url.replace(/\/$/, "");
}

/** Every usable `key` tag, in the user's order of preference. */
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
 * The new private tags: [keys] first, in order, each with the extra values it was read
 * with; then every other tag as it was found — tags that aren't keys, and `key` tags
 * this app couldn't use — so data another app keeps here survives this one's edit.
 */
export function withAgentKeys(privateTags: string[][], keys: AgentKey[]): string[][] {
  return [
    ...keys.map((k) => [KEY_TAG, k.key, k.url, ...(k.extra ?? [])]),
    ...privateTags.filter((t) => t[0] !== KEY_TAG || parseKeyTag(t) === null),
  ];
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
  /** At most a few words, shown as a chip on the form when it matters. */
  hint?: string;
  /** Where the provider hands out keys, for "Get a key". */
  keyPage?: string;
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
    keyPage: "https://openrouter.ai/keys",
    // Its model list is public; `/key` describes the key and 401s on a bad one.
    keyCheckPath: "/key",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    url: "https://api.anthropic.com/v1",
    // Claude Pro/Max sign-ins can't be used by other apps; only Console keys work.
    hint: "Console key, not Pro/Max",
    keyPage: "https://console.anthropic.com/settings/keys",
  },
  { id: "openai", name: "OpenAI", url: "https://api.openai.com/v1", keyPage: "https://platform.openai.com/api-keys" },
  {
    id: "gemini",
    name: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyPage: "https://aistudio.google.com/apikey",
  },
  { id: "routstr", name: "Routstr", url: "https://api.routstr.com/v1", hint: "Pays with Cashu" },
  {
    id: "ppq",
    name: "PPQ.ai",
    url: "https://api.ppq.ai/v1",
    hint: "Pays with Lightning",
    keyPage: "https://ppq.ai",
    keyCheckPath: null,
  },
  {
    id: "venice",
    name: "Venice",
    url: "https://api.venice.ai/api/v1",
    keyPage: "https://venice.ai/settings/api",
    keyCheckPath: "/api_keys/rate_limits",
  },
  {
    id: "near",
    name: "NEAR AI",
    url: "https://cloud-api.near.ai/v1",
    keyPage: "https://cloud.near.ai",
    keyCheckPath: "/users/me",
  },
  { id: "mistral", name: "Mistral", url: "https://api.mistral.ai/v1", keyPage: "https://console.mistral.ai/api-keys" },
  { id: "groq", name: "Groq", url: "https://api.groq.com/openai/v1", keyPage: "https://console.groq.com/keys" },
  { id: "xai", name: "xAI", url: "https://api.x.ai/v1", keyPage: "https://console.x.ai" },
  {
    id: "deepseek",
    name: "DeepSeek",
    url: "https://api.deepseek.com/v1",
    keyPage: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "together",
    name: "Together",
    url: "https://api.together.xyz/v1",
    keyPage: "https://api.together.ai/settings/api-keys",
  },
  {
    id: "fireworks",
    name: "Fireworks",
    url: "https://api.fireworks.ai/inference/v1",
    keyPage: "https://fireworks.ai/account/api-keys",
  },
  { id: "cerebras", name: "Cerebras", url: "https://api.cerebras.ai/v1", keyPage: "https://cloud.cerebras.ai" },
  // A page only reaches a local runner once the runner lets this site in
  // (OLLAMA_ORIGINS, LM Studio's CORS switch); the form says so in a tooltip.
  { id: "ollama", name: "Ollama", url: "http://localhost:11434/v1", keyless: true },
  { id: "lmstudio", name: "LM Studio", url: "http://localhost:1234/v1", keyless: true },
  { id: "custom", name: "Custom", url: "" },
];

/** The preset a stored URL belongs to, by host. */
export function presetForUrl(url: string): AgentPreset | undefined {
  const host = parseUrl(url)?.host;
  return host ? AGENT_PRESETS.find((p) => p.url && parseUrl(p.url)?.host === host) : undefined;
}

function parseUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * The URL as stored: trimmed, no trailing slash. Null when it isn't an http(s) URL, or
 * when it is plain http to a host other than this computer while [key] is not empty.
 */
export function normalizeAgentUrl(input: string, key: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, "");
  return parseUrl(trimmed) && isSecureAgentUrl(trimmed, key) ? trimmed : null;
}

/** A provider's name for a stored URL: the preset's when it is one, else its host. */
export function providerName(url: string): string {
  const u = parseUrl(url);
  if (!u) return url;
  return presetForUrl(url)?.name ?? u.host;
}

/** `sk-or-…a1b2`: enough to tell two keys apart, never enough to use one. */
export function maskKey(key: string): string {
  if (!key) return "No key";
  if (key.length < 14) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
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
  const preset = presetForUrl(entry.url);
  const path = preset?.keyCheckPath ?? "/models";
  const keyChecked = preset?.keyCheckPath !== null;
  const headers: Record<string, string> = {};
  // Never in cleartext, and no Authorization at all for an empty key.
  const secret = entry.key && isSecureAgentUrl(entry.url, entry.key) ? entry.key : "";
  if (secret) headers.Authorization = `Bearer ${secret}`;
  if (parseUrl(entry.url)?.host === "api.anthropic.com") {
    if (secret) headers["x-api-key"] = secret;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return { url: `${apiRoot(entry.url)}${path}`, headers, keyChecked };
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

/**
 * What a test result says under the key field: a few words, never a sentence. `tone`
 * picks the status icon (ok, a check; unchecked, a question mark; rejected, an x;
 * anything else, a warning).
 */
export function testCaption(result: KeyTestResult): {
  tone: "ok" | "unchecked" | "rejected" | "problem";
  text: string;
} {
  switch (result.status) {
    case "ok":
      if (result.unverified) return { tone: "unchecked", text: "Answered, key unchecked" };
      if (result.models === null) return { tone: "ok", text: "Works" };
      return {
        tone: "ok",
        text: `Works · ${result.models.toLocaleString()} ${result.models === 1 ? "model" : "models"}`,
      };
    case "rejected":
      return { tone: "rejected", text: "Key rejected" };
    case "failed":
      return { tone: "problem", text: `Error ${result.httpStatus}` };
    case "unreachable":
      return { tone: "problem", text: "Can't reach it" };
  }
}
