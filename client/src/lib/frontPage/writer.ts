/**
 * The writer call: one fixed system prompt, the digest as data, one HTML document
 * back. Sent with the reader's own AI key (kind 12000, NIP-FA) to any endpoint that
 * speaks OpenAI Chat Completions.
 *
 * The prompt is NosFabrica/the-nostr-observer's editorial brief and house stylesheet
 * (MIT, see ./LICENSE.observer), corrected for this harness in ./editorial.md. Unlike
 * the Observer server, this has no Message Batches and no fixed model: the reader's
 * key decides the provider, and the reader picks the model.
 */
import type { AgentKey } from "@/lib/agentKeys";
import type { Violation } from "./validate";
import brief from "./editorial.md?raw";
import houseCss from "./house.css?raw";

/** The paper's standing name. The Observer carries it forward day to day; this has no continuity. */
export const MASTHEAD = { name: "The Nostr Observer" };

/** The fixed system prompt: hidden from nothing (it ships in the bundle), but never written by the corpus. */
export function systemPrompt(): string {
  return `${brief}\n\n## The house stylesheet\n\nInline this in a <style> block, as given:\n\n\`\`\`css\n${houseCss}\n\`\`\``;
}

/**
 * The digest arrives in a delimited block, framed once in the system prompt as data.
 * The reader's name goes outside it: it is ours, not the corpus's.
 */
export function userMessage(digest: string, readerName: string): string {
  return [
    `Masthead: ${MASTHEAD.name}`,
    `Reader: ${readerName}`,
    "",
    "<corpus>",
    digest,
    "</corpus>",
    "",
    "Write today's front page. Return the complete HTML document and nothing else.",
  ].join("\n");
}

/** One repair round: the page the boundary refused, and why. */
export function repairMessage(violations: Violation[]): string {
  const lines = violations.slice(0, 40).map((v) => `- ${v.kind}: ${v.detail}\n  ${v.excerpt.replace(/\s+/g, " ")}`);
  return [
    "The boundary check refused that page. Every item below must be fixed:",
    "",
    ...lines,
    "",
    "QUOTE: copy the words exactly from one event, or paraphrase without <q>/<blockquote>.",
    'IMAGE: use <img src="art-N"> ids from the shortlist only.',
    "LINK: only the citation, watch, listing and calendar URL forms the brief allows.",
    "MARKUP: no scripts, forms, frames or handlers.",
    "",
    "Return the corrected complete HTML document and nothing else.",
  ].join("\n");
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Headers for a key, the way `modelsRequest` sends them: Anthropic answers a web page only when told it means to. */
export function authHeaders(key: AgentKey): Record<string, string> {
  const headers: Record<string, string> = {};
  if (key.key) headers.Authorization = `Bearer ${key.key}`;
  if (hostOf(key.url) === "api.anthropic.com") {
    if (key.key) headers["x-api-key"] = key.key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return headers;
}

/**
 * Room for a whole broadsheet. Sent only to Anthropic, whose compatibility layer
 * otherwise caps a reply far below a page; elsewhere an unknown limit for the model
 * is a 400, and the provider's default is plenty.
 */
const ANTHROPIC_MAX_TOKENS = 32_000;

export function chatRequest(key: AgentKey, model: string, messages: ChatMessage[], stream: boolean) {
  const body: Record<string, unknown> = { model, messages, stream };
  if (stream) body.stream_options = { include_usage: true };
  if (hostOf(key.url) === "api.anthropic.com") body.max_tokens = ANTHROPIC_MAX_TOKENS;
  return {
    url: `${key.url.replace(/\/+$/, "")}/chat/completions`,
    init: {
      method: "POST",
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    } satisfies RequestInit,
  };
}

export interface Usage {
  promptTokens: number | null;
  completionTokens: number | null;
}

export function readUsage(raw: unknown): Usage | null {
  const usage = raw as { prompt_tokens?: unknown; completion_tokens?: unknown } | null | undefined;
  if (!usage || typeof usage !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { promptTokens: n(usage.prompt_tokens), completionTokens: n(usage.completion_tokens) };
}

/**
 * Server-sent events, one `data:` line at a time, from Chat Completions streaming.
 * Returns the text added by this chunk and any usage it carried.
 */
export function parseStreamLine(line: string): { text: string; usage: Usage | null; done: boolean } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return { text: "", usage: null, done: false };
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return { text: "", usage: null, done: true };
  try {
    const json = JSON.parse(data) as {
      choices?: { delta?: { content?: unknown } }[];
      usage?: unknown;
    };
    const content = json.choices?.[0]?.delta?.content;
    return { text: typeof content === "string" ? content : "", usage: readUsage(json.usage), done: false };
  } catch {
    return { text: "", usage: null, done: false };
  }
}

/** A non-streamed answer's text. */
export function readCompletion(json: unknown): { text: string; usage: Usage | null } {
  const body = json as { choices?: { message?: { content?: unknown } }[]; usage?: unknown };
  const content = body?.choices?.[0]?.message?.content;
  return { text: typeof content === "string" ? content : "", usage: readUsage(body?.usage) };
}

/**
 * The document, without the wrapping a model adds despite being told not to: a
 * markdown fence, or a sentence before the doctype.
 */
export function extractDocument(text: string): string {
  let out = text.trim();
  const fence = /^```(?:html)?\s*\n([\s\S]*?)\n?```\s*$/i.exec(out);
  if (fence) out = fence[1].trim();
  const start = out.search(/<!doctype html|<html[\s>]/i);
  if (start > 0) out = out.slice(start);
  const end = out.toLowerCase().lastIndexOf("</html>");
  if (end >= 0) out = out.slice(0, end + "</html>".length);
  return out;
}

// --- choosing a model --------------------------------------------------------

/**
 * Model ids a front page is worth writing with, best first. A page is a long,
 * careful document — a strong writer earns its cost once a day — so the families
 * known for long-form writing lead, and small/fast variants trail. Within a family
 * the higher version wins (ids sort that way in practice).
 */
const PREFERENCE: RegExp[] = [
  /claude[-.\w]*sonnet|sonnet[-.\w]*claude/i,
  /claude[-.\w]*opus|opus/i,
  /gpt-5(?![-.\w]*(mini|nano))/i,
  /gemini[-.\w]*pro/i,
  /gpt-4\.1(?![-.\w]*(mini|nano))|gpt-4o(?![-.\w]*mini)/i,
  /deepseek[-.\w]*(chat|v3|r1)/i,
  /qwen[-.\w]*(max|72b|235b)|llama[-.\w]*(405b|70b)|mistral[-.\w]*large|grok/i,
  /claude|gpt|gemini|llama|qwen|mistral|deepseek/i,
];

/** Not writers at all. */
const NOT_CHAT =
  /embed|whisper|tts|transcri|audio|realtime|image|dall-?e|moderation|rerank|vision-preview|search-preview/i;

function versionKey(id: string): number[] {
  return (id.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function compareVersionsDesc(a: string, b: string): number {
  const va = versionKey(a);
  const vb = versionKey(b);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const d = (vb[i] ?? -1) - (va[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
}

/** Every listed model a page could be written with, best guess first. */
export function rankModels(ids: string[]): string[] {
  const usable = [...new Set(ids)].filter((id) => id && !NOT_CHAT.test(id));
  const tier = (id: string) => {
    const at = PREFERENCE.findIndex((re) => re.test(id));
    const small = /mini|nano|haiku|flash|lite|small|8b|7b|3b|1b/i.test(id) ? 0.5 : 0;
    return (at === -1 ? PREFERENCE.length : at) + small;
  };
  return usable.sort((a, b) => tier(a) - tier(b) || compareVersionsDesc(a, b));
}

/** `GET {url}/models` → ids, whichever of the two common shapes it comes in. */
export function readModelIds(json: unknown): string[] {
  const body = json as { data?: unknown; models?: unknown } | null;
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  return (list as unknown[])
    .map((m) => {
      if (typeof m === "string") return m;
      const entry = m as { id?: unknown; name?: unknown };
      return typeof entry?.id === "string" ? entry.id : typeof entry?.name === "string" ? entry.name : "";
    })
    .map((id) => id.replace(/^models\//, ""))
    .filter(Boolean);
}
