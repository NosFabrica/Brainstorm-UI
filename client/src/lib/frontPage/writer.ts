/**
 * The writer calls: one fixed system prompt, the digest as data, a plan and then one HTML
 * document back, sent with the reader's own AI key (kind 12000, NIP-FA) to any endpoint that
 * speaks OpenAI Chat Completions.
 *
 * The prompt is NosFabrica/the-nostr-observer's editorial brief and house stylesheet (MIT,
 * see ./LICENSE.observer), rewritten for the apps in ./editorial.md: the same text as
 * Amethyst's `EditorialBrief.kt` (a test pins its hash in both). Matched to Amethyst's
 * `commons/.../frontpage/Writer.kt`. Unlike the Observer server, this has no Message Batches
 * and no fixed model: the reader's key decides the provider, and the reader picks the model.
 */
import { apiRoot, isSecureAgentUrl, type AgentKey } from "@/lib/agentKeys";
import type { WritingEffort } from "./observerSchedule";
import type { Corpus } from "./corpus";
import { MASTHEAD as HOUSE_MASTHEAD, emptyContext, longDay, type EditionContext } from "./edition";
import { BRAINSTORM_LINKS, linksLine } from "./links";
import { FULL_BLOCK_CHARS, HOUSE_CSS, PLAN_MAX_TOKENS, PLAN_OUTPUT_TOKENS, WRITE_INSTRUCTION } from "./plan";
import type { Violation } from "./validate";
import brief from "./editorial.md?raw";

/** The paper's house name: its masthead until an edition announces another (`standingPaper`). */
export const MASTHEAD = { name: HOUSE_MASTHEAD };

/**
 * The system message, the same in every call of a print (the plan, the page, each repair),
 * so a provider that caches a prefix reads it once: the brief, then the house stylesheet for
 * reference. The page carries an empty `<style id="house">` that `insertHouseCss` fills. The
 * leading newline matches Amethyst's constant, so the two apps send the same bytes.
 */
export function systemPrompt(): string {
  return `\n${brief}\n\n## The house stylesheet\n\nFor reference: the app puts this into your page's \`<style id="house">\`. Do not copy it.\n\n\`\`\`css\n${HOUSE_CSS}\n\`\`\``;
}

/** The size of the day, as the dateline prints it: events read, the voices among them, and the events kept in the digest. */
export interface DaySize {
  read: number;
  voices: number;
  kept: number;
}

/**
 * What the writer is told about the edition, above the corpus and outside it, because it is
 * ours: the paper as the last edition left it, the reader, the language (a BCP 47 tag,
 * "pt-BR": the brief says what to do with one), the edition's number and code, the date and
 * the window's close on the reader's clock with the zone named, the size of the day and the
 * last few front pages.
 */
export function editionHeader(
  readerName: string,
  language: string | null = null,
  context: EditionContext = emptyContext(),
  corpus: Corpus | null = null,
  size: DaySize | null = null,
): string {
  const lines: string[] = [`Masthead: ${context.paper.masthead}`];
  if (context.paper.motto) lines.push(`Motto: ${context.paper.motto}`);
  if (context.paper.sections.length > 0) lines.push(`Standing sections: ${context.paper.sections.join(" \u00b7 ")}`);
  lines.push(`Reader: ${readerName}`);
  const tag = language?.trim();
  if (tag) lines.push(`Language: ${tag}`);
  if (context.number !== null) lines.push(`Edition: Vol. I \u00b7 No. ${context.number}`);
  if (corpus) {
    const { clock } = context;
    lines.push(linksLine(corpus.links ?? BRAINSTORM_LINKS));
    lines.push(`Edition code: ${corpus.code}`);
    lines.push(`Date: ${clock.date(corpus.until)}`);
    lines.push(
      `Window: the 24 hours to ${clock.time(corpus.until)}, on the reader's clock (${clock.zoneLabel(corpus.until)}). Every time below is on that clock.`,
    );
  }
  if (size) lines.push(`The day: ${size.read} events read, ${size.voices} voices, ${size.kept} kept in the digest.`);
  if (context.recent.length > 0) {
    lines.push("Recent front pages (do not run a story again unless it moved):");
    for (const r of context.recent) lines.push(`- ${longDay(r.day)}: ${r.headline}`);
  }
  return lines.join("\n");
}

/**
 * The part of the user message that is the same in every call of a print, so a provider
 * that caches a prefix reads it once: the edition's header and the digest in its delimited
 * block.
 */
export function corpusPrefix(digest: string, header: string): string {
  return `${header}\n\n<corpus>\n${digest}\n</corpus>`;
}

/** The single-pass message: the header, the digest in its block, the instruction. */
export function userMessage(
  digest: string,
  readerName: string,
  language: string | null = null,
  context: EditionContext = emptyContext(),
): string {
  return `${corpusPrefix(digest, editionHeader(readerName, language, context))}\n\n${WRITE_INSTRUCTION}`;
}

/** One repair round: only what the check found, and a request for the whole page again. */
export function repairMessage(violations: Violation[]): string {
  const lines = violations.slice(0, 40).map((v) => `- ${v.kind}: ${v.detail}\n  ${v.excerpt.replace(/\s+/g, " ")}`);
  return [
    "The check found these to fix:",
    "",
    ...lines,
    "",
    "QUOTE: copy the words exactly from one event, or paraphrase without <q>/<blockquote>.",
    'IMAGE: use <img src="art-N"> ids from the shortlist only.',
    "LINK: only the citation and byline forms the brief allows, on the two link bases you were given.",
    "MARKUP: no scripts, forms, frames or handlers.",
    "",
    'Fix each one and send the whole corrected page back; nothing else about it needs to change. Keep <style id="house"></style> empty: the app still puts the house stylesheet in.',
    "Return the corrected complete HTML document and nothing else.",
  ].join("\n");
}

// --- what a print costs -------------------------------------------------------

/** What a page usually takes to write: a full HTML document. A repair round is not counted. */
export const EXPECTED_OUTPUT_TOKENS = 14_000;

/** What the posts in full usually come to, for the estimate: half the block's cap. */
export const EXPECTED_FULL_CHARS = FULL_BLOCK_CHARS / 2;

/** What Deep adds to each of the two calls, for the estimate: the reasoning, billed as output. */
export const DEEP_REASONING_TOKENS = 12_000;

/** A rough token count: about four characters a token, for English-heavy text. */
export const approxTokens = (chars: number) => Math.ceil(chars / 4);

/**
 * The tokens one print sends and gets back, before it runs (Amethyst's `editionTokens`):
 * two calls, the plan reading the brief and the digest and writing about
 * `PLAN_OUTPUT_TOKENS`, the page reading them again with the posts in full and writing a
 * page; Deep adds `DEEP_REASONING_TOKENS` of reasoning to each. Brainstorm keeps no last
 * digest size, so the digest's budget stands in: the most a day sends, which is the right
 * way to be off when the question is whether a balance covers it.
 */
export function editionTokens(
  digestChars: number,
  briefChars = systemPrompt().length,
  effort: WritingEffort = "standard",
): { prompt: number; completion: number; requests: number } {
  const prompt = approxTokens(digestChars + briefChars);
  const reasoning = effort === "deep" ? 2 * DEEP_REASONING_TOKENS : 0;
  return {
    prompt: prompt + prompt + approxTokens(EXPECTED_FULL_CHARS),
    completion: PLAN_OUTPUT_TOKENS + EXPECTED_OUTPUT_TOKENS + reasoning,
    requests: 2,
  };
}

/**
 * One message. `prefix`, when set, is the part of the text a provider may cache (the header
 * and the digest, the same in every call of a print): sent first, marked where the provider
 * takes a mark (`cachesPrefixes`), else simply joined to `content`.
 */
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; prefix?: string };

/** The whole text of a message, as a provider without caching reads it. */
export const messageText = (m: ChatMessage) => (m.prefix === undefined ? m.content : m.prefix + m.content);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const isAnthropic = (url: string) => hostOf(url) === "api.anthropic.com";
export const isOpenRouter = (url: string) => hostOf(url) === "openrouter.ai";
export const isOpenAI = (url: string) => hostOf(url) === "api.openai.com";

/** Headers for a key, the way `modelsRequest` sends them: Anthropic answers a web page only when told it means to. */
export function authHeaders(key: AgentKey): Record<string, string> {
  const headers: Record<string, string> = {};
  // NIP-FA: never in cleartext, and no Authorization at all for an empty key.
  const secret = key.key && isSecureAgentUrl(key.url, key.key) ? key.key : "";
  if (secret) headers.Authorization = `Bearer ${secret}`;
  if (isAnthropic(key.url)) {
    if (secret) headers["x-api-key"] = secret;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  return headers;
}

/** The output limit of a page when the model's own isn't known. */
export const DEFAULT_OUTPUT_TOKENS = 32_000;

/** The most a page call ever asks for, whatever the model allows. */
export const MAX_OUTPUT_TOKENS = 64_000;

/** The least a page call asks for when only the context window is known: room for a page. */
export const MIN_PAGE_TOKENS = 8_000;

/** Kept free of the context window, beyond the prompt's estimate, when the limit is worked out from it. */
const CONTEXT_MARGIN_TOKENS = 2_000;

/** On Anthropic, Deep's thinking budget: at most this, and less than half the call's limit. */
export const DEEP_THINKING_TOKENS = 16_000;

/** What `/models` says of a model's limits, when it says. */
export interface ModelLimits {
  /** The most it writes in one answer: OpenRouter's `top_provider.max_completion_tokens`, Anthropic's `max_tokens`. */
  maxOutputTokens?: number | null;
  /** Its context window, prompt and answer together: `context_length` (OpenRouter, Routstr). */
  contextLength?: number | null;
}

const positive = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * A page call's output limit: the model's own up to `MAX_OUTPUT_TOKENS`; else what its
 * context window leaves after `promptTokens`, within `MIN_PAGE_TOKENS`..`MAX_OUTPUT_TOKENS`;
 * else `DEFAULT_OUTPUT_TOKENS`.
 */
export function outputTokenLimit(model: ModelLimits | null | undefined, promptTokens: number): number {
  if (positive(model?.maxOutputTokens)) return Math.min(model.maxOutputTokens, MAX_OUTPUT_TOKENS);
  if (positive(model?.contextLength)) {
    const left = model.contextLength - promptTokens - CONTEXT_MARGIN_TOKENS;
    return Math.min(Math.max(left, MIN_PAGE_TOKENS), MAX_OUTPUT_TOKENS);
  }
  return DEFAULT_OUTPUT_TOKENS;
}

/** A plan call's output limit: `PLAN_MAX_TOKENS`, or the model's own when that is less. */
export function planTokenLimit(model: ModelLimits | null | undefined): number {
  return positive(model?.maxOutputTokens) ? Math.min(model.maxOutputTokens, PLAN_MAX_TOKENS) : PLAN_MAX_TOKENS;
}

/** Anthropic's thinking budget for Deep within a call limited to `maxTokens`: at least 1,024, under half the limit. */
export function anthropicThinkingBudget(maxTokens: number): number {
  return Math.max(1_024, Math.min(DEEP_THINKING_TOKENS, Math.floor(maxTokens / 2)));
}

/**
 * Whether a call to `model` at `url` marks the cacheable prefix with `cache_control`: only
 * where it is documented, OpenRouter's Anthropic models (explicit breakpoints on content
 * blocks). Anthropic's own OpenAI-compatible endpoint says prompt caching isn't supported
 * there; OpenAI and the rest cache a prefix on their own, unmarked.
 */
export function cachesPrefixes(url: string, model: string): boolean {
  return isOpenRouter(url) && model.toLowerCase().startsWith("anthropic/");
}

export interface CallOptions {
  /** The call's output limit; Anthropic's endpoint needs one, so it gets `DEFAULT_OUTPUT_TOKENS` when none is given. */
  maxTokens?: number | null;
  effort?: WritingEffort;
}

/**
 * One Chat Completions request body. `maxTokens` goes out on every provider (OpenAI's own API
 * takes it as `max_completion_tokens`, which its reasoning models require). Deep maps to each
 * provider's knob: OpenRouter's `reasoning: {effort: "high"}`, Anthropic's documented
 * `thinking` budget, and OpenAI's `reasoning_effort: "high"` elsewhere. Standard sends
 * nothing: on OpenRouter a `reasoning` object may turn thinking on (and bill it) for a model
 * where it is optional, and a model that reasons anyway streams it unasked, which
 * `parseStreamLine` reads when it comes.
 */
export function chatRequestBody(
  url: string,
  model: string,
  messages: ChatMessage[],
  stream: boolean,
  { maxTokens = null, effort = "standard" }: CallOptions = {},
): Record<string, unknown> {
  const marks = cachesPrefixes(url, model);
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) =>
      marks && m.prefix !== undefined
        ? {
            role: m.role,
            // OpenRouter's explicit breakpoint: everything through this block is the cached prefix.
            content: [
              { type: "text", text: m.prefix, cache_control: { type: "ephemeral" } },
              { type: "text", text: m.content },
            ],
          }
        : { role: m.role, content: messageText(m) },
    ),
    stream,
  };
  if (stream) body.stream_options = { include_usage: true };
  const limit = maxTokens ?? (isAnthropic(url) ? DEFAULT_OUTPUT_TOKENS : null);
  if (limit !== null) body[isOpenAI(url) ? "max_completion_tokens" : "max_tokens"] = limit;
  if (effort === "deep") {
    if (isOpenRouter(url)) body.reasoning = { effort: "high" };
    // Documented on Anthropic's OpenAI SDK compatibility page; on models that reject a
    // budget the layer turns it into adaptive thinking. Its `reasoning_effort` is ignored.
    else if (isAnthropic(url))
      body.thinking = { type: "enabled", budget_tokens: anthropicThinkingBudget(limit ?? DEFAULT_OUTPUT_TOKENS) };
    else body.reasoning_effort = "high";
  }
  return body;
}

/**
 * Whether a call carries something a provider might refuse that the plain request didn't: a
 * limit (Anthropic's is required, so not counted there) or Deep.
 */
export function carriesExtras(url: string, { maxTokens = null, effort = "standard" }: CallOptions = {}): boolean {
  return (maxTokens !== null && !isAnthropic(url)) || effort === "deep";
}

export function chatRequest(
  key: AgentKey,
  model: string,
  messages: ChatMessage[],
  stream: boolean,
  options: CallOptions = {},
) {
  return {
    url: `${apiRoot(key.url)}/chat/completions`,
    init: {
      method: "POST",
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify(chatRequestBody(key.url, model, messages, stream, options)),
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

/** What one line of a Chat Completions event stream says. */
export interface StreamChunk {
  text: string;
  /** Thinking a reasoning model streams before (or beside) the page. */
  reasoning: string;
  /** An SSE comment (`: OPENROUTER PROCESSING`): no data, but the provider is still there. */
  alive: boolean;
  usage: Usage | null;
  /** `[DONE]`: stop reading. */
  done: boolean;
  /** The choice's `finish_reason`, when this chunk carried one. */
  finishReason: string | null;
  /** An `{"error": …}` frame: the provider failed mid-answer. */
  error: string | null;
}

function errorText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const message = (raw as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : "the provider reported an error";
}

/**
 * Server-sent events, one `data:` line at a time, from Chat Completions streaming.
 * Returns the text added by this chunk, any usage it carried, and how it ends.
 */
export function parseStreamLine(line: string): StreamChunk {
  const none: StreamChunk = {
    text: "",
    reasoning: "",
    alive: false,
    usage: null,
    done: false,
    finishReason: null,
    error: null,
  };
  const trimmed = line.trim();
  if (trimmed.startsWith(":")) return { ...none, alive: true };
  if (!trimmed.startsWith("data:")) return none;
  const data = trimmed.slice(5).trim();
  if (data === "[DONE]") return { ...none, done: true };
  try {
    const json = JSON.parse(data) as {
      choices?: {
        delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown; reasoning_details?: unknown };
        finish_reason?: unknown;
      }[];
      usage?: unknown;
      error?: unknown;
    };
    if (json.error !== undefined && json.error !== null) return { ...none, error: errorText(json.error) };
    const choice = json.choices?.[0];
    const content = choice?.delta?.content;
    return {
      ...none,
      text: typeof content === "string" ? content : "",
      reasoning: reasoningOf(choice?.delta),
      usage: readUsage(json.usage),
      finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : null,
    };
  } catch {
    return none;
  }
}

/**
 * The thinking in one delta, however the provider spells it: OpenRouter's
 * `reasoning_details` (its `reasoning.text` and `reasoning.summary` items; an encrypted one
 * has nothing to read), else its plain `reasoning`, which carries the same text; DeepSeek's
 * and others' `reasoning_content`.
 */
function reasoningOf(
  delta: { reasoning?: unknown; reasoning_content?: unknown; reasoning_details?: unknown } | undefined,
): string {
  if (!delta) return "";
  if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0) {
    let out = "";
    for (const d of delta.reasoning_details as { type?: unknown; text?: unknown; summary?: unknown }[]) {
      if (d?.type === "reasoning.text" && typeof d.text === "string") out += d.text;
      else if (d?.type === "reasoning.summary" && typeof d.summary === "string") out += d.summary;
    }
    if (out) return out;
  }
  if (typeof delta.reasoning === "string") return delta.reasoning;
  if (typeof delta.reasoning_content === "string") return delta.reasoning_content;
  return "";
}

/** A non-streamed answer: its text, usage, and how it ended (`error` when it failed). */
export function readCompletion(json: unknown): {
  text: string;
  usage: Usage | null;
  finishReason: string | null;
  error: string | null;
} {
  const body = json as {
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
    usage?: unknown;
    error?: unknown;
  } | null;
  const usage = readUsage(body?.usage);
  if (body?.error !== undefined && body?.error !== null) {
    return { text: "", usage, finishReason: null, error: errorText(body.error) };
  }
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  return { text: typeof content === "string" ? content : "", usage, finishReason, error: null };
}

/**
 * Why an answer is not a whole page, or null when it is. A page cut off by the token
 * limit (`length`) or a content filter is half a newspaper, and half a newspaper is
 * not printed. A missing reason is accepted only where the caller saw the stream end
 * properly (`[DONE]`) or the answer was not streamed.
 */
export function unfinished(finishReason: string | null, { required }: { required: boolean }): string | null {
  if (finishReason === "stop") return null;
  if (finishReason === null) return required ? "the answer stopped before it was finished" : null;
  if (finishReason === "length") return "the answer ran out of room before the page was finished";
  if (finishReason === "content_filter") return "the provider's content filter stopped the answer";
  return `the answer ended early (${finishReason.slice(0, 40)})`;
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
  // Opus-class first: a page is the longest, most careful thing the reader pays a model for.
  /claude[-.\w]*opus|opus/i,
  /claude[-.\w]*sonnet|sonnet[-.\w]*claude/i,
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

/** `GET {url}/models` → each model's limits, by id, where the endpoint says them. */
export function readModelLimits(json: unknown): Map<string, ModelLimits> {
  const body = json as { data?: unknown; models?: unknown } | null;
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  const count = (obj: unknown, name: string) => {
    const v = (obj as Record<string, unknown> | null | undefined)?.[name];
    return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
  };
  const out = new Map<string, ModelLimits>();
  for (const m of list as unknown[]) {
    if (!m || typeof m !== "object") continue;
    const entry = m as { id?: unknown; name?: unknown; top_provider?: unknown };
    const raw = typeof entry.id === "string" ? entry.id : typeof entry.name === "string" ? entry.name : "";
    const id = raw.replace(/^models\//, "");
    if (!id) continue;
    const maxOutputTokens = count(entry.top_provider, "max_completion_tokens") ?? count(entry, "max_tokens");
    const contextLength = count(entry, "context_length") ?? count(entry.top_provider, "context_length");
    if (maxOutputTokens !== null || contextLength !== null) out.set(id, { maxOutputTokens, contextLength });
  }
  return out;
}
