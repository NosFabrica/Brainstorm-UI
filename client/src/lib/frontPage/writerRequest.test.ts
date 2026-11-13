import { describe, expect, it } from "vitest";
import { emptyTask, readTask } from "@/lib/scheduledTasks";
import {
  EFFORT_PARAM,
  KNOWN_PARAMS,
  effortOf,
  observerEffort,
  observerUnderstands,
  unknownObserverParams,
  withObserverEffort,
} from "./observerSchedule";
import { PLAN_MAX_TOKENS } from "./plan";
import {
  DEEP_REASONING_TOKENS,
  DEEP_THINKING_TOKENS,
  DEFAULT_OUTPUT_TOKENS,
  EXPECTED_OUTPUT_TOKENS,
  MIN_PAGE_TOKENS,
  approxTokens,
  chatRequestBody,
  editionTokens,
  outputTokenLimit,
  planTokenLimit,
  rankModels,
  readModelLimits,
  type CallOptions,
  type ChatMessage,
} from "./writer";
import { estimateCost } from "@/lib/routstr";

// Amethyst's WriterRequestTest: what a writer call sends, its limit, its effort and its
// cache mark, per provider.

const openRouter = "https://openrouter.ai/api/v1";
const anthropic = "https://api.anthropic.com/v1";
const openAi = "https://api.openai.com/v1";
const other = "https://api.deepseek.com/v1";
const messages: ChatMessage[] = [
  { role: "system", content: "brief" },
  { role: "user", content: "\n\nplan it", prefix: "header and digest" },
];

type Body = Record<string, unknown> & { messages: { content: unknown }[] };
const body = (url: string, { model = "m", ...options }: CallOptions & { model?: string } = {}) =>
  chatRequestBody(url, model, messages, true, { maxTokens: 48_000, ...options }) as Body;

describe("a writer call", () => {
  it("sends max_tokens on every provider", () => {
    expect(body(openRouter).max_tokens).toBe(48_000);
    expect(body(anthropic).max_tokens).toBe(48_000);
    expect(body(other).max_tokens).toBe(48_000);
    // OpenAI's reasoning models take only max_completion_tokens.
    expect(body(openAi).max_completion_tokens).toBe(48_000);
    expect(body(openAi).max_tokens).toBeUndefined();
    // Anthropic needs one even when none is given.
    expect(body(anthropic, { maxTokens: null }).max_tokens).toBe(DEFAULT_OUTPUT_TOKENS);
  });

  it("maps Deep to each provider's knob, and Standard sends nothing", () => {
    expect(body(openRouter, { effort: "deep" }).reasoning).toEqual({ effort: "high" });
    expect(body(openAi, { effort: "deep" }).reasoning_effort).toBe("high");
    expect(body(other, { effort: "deep" }).reasoning_effort).toBe("high");
    expect(body(anthropic, { effort: "deep" }).thinking).toEqual({
      type: "enabled",
      budget_tokens: DEEP_THINKING_TOKENS,
    });
    // The budget stays under the call's limit (a plan call is small).
    expect(body(anthropic, { maxTokens: 12_000, effort: "deep" }).thinking).toEqual({
      type: "enabled",
      budget_tokens: 6_000,
    });
    for (const url of [openRouter, anthropic, openAi, other]) {
      const plain = body(url);
      for (const field of ["reasoning", "reasoning_effort", "thinking"])
        expect(plain[field], `${url} ${field}`).toBeUndefined();
    }
  });

  it("marks the cache only where it is documented", () => {
    const marked = body(openRouter, { model: "anthropic/claude-opus-4.8" }).messages[1].content as {
      text: string;
      cache_control?: unknown;
    }[];
    expect(marked[0].text).toBe("header and digest");
    expect(marked[0].cache_control).toEqual({ type: "ephemeral" });
    expect(marked[1].text).toBe("\n\nplan it");
    expect(marked[1].cache_control).toBeUndefined();
    // The system message carries no mark; every other provider gets plain text.
    expect(typeof body(openRouter, { model: "anthropic/claude-opus-4.8" }).messages[0].content).toBe("string");
    for (const [url, model] of [
      [openRouter, "openai/gpt-5"],
      [anthropic, "claude-opus-4-8"],
      [openAi, "gpt-5"],
    ]) {
      expect(body(url, { model }).messages[1].content, url).toBe("header and digest\n\nplan it");
    }
  });

  it("asks for the model's own output limit, capped, else the default", () => {
    expect(outputTokenLimit({ maxOutputTokens: 128_000 }, 50_000)).toBe(64_000);
    expect(outputTokenLimit({ maxOutputTokens: 16_384 }, 50_000)).toBe(16_384);
    expect(outputTokenLimit({ contextLength: 98_000 }, 50_000)).toBe(46_000);
    expect(outputTokenLimit({ contextLength: 32_000 }, 50_000)).toBe(MIN_PAGE_TOKENS);
    expect(outputTokenLimit({}, 50_000)).toBe(DEFAULT_OUTPUT_TOKENS);
    expect(outputTokenLimit(null, 50_000)).toBe(DEFAULT_OUTPUT_TOKENS);
    expect(planTokenLimit({ maxOutputTokens: 128_000 })).toBe(PLAN_MAX_TOKENS);
    expect(planTokenLimit({ maxOutputTokens: 8_192 })).toBe(8_192);
    expect(planTokenLimit(null)).toBe(PLAN_MAX_TOKENS);
  });

  it("reads each model's limits from the model list", () => {
    const limits = readModelLimits({
      data: [
        {
          id: "anthropic/claude-opus-4.8",
          context_length: 1_000_000,
          top_provider: { context_length: 1_000_000, max_completion_tokens: 128_000 },
        },
        { id: "claude-opus-4-8", type: "model", max_input_tokens: 1_000_000, max_tokens: 128_000 },
        { id: "tiny", context_length: 32_768 },
        { id: "gpt-5" },
      ],
    });
    expect(limits.get("anthropic/claude-opus-4.8")).toEqual({ maxOutputTokens: 128_000, contextLength: 1_000_000 });
    expect(limits.get("claude-opus-4-8")?.maxOutputTokens).toBe(128_000);
    expect(limits.get("tiny")?.contextLength).toBe(32_768);
    expect(limits.get("gpt-5")).toBeUndefined();
  });

  it("ranks an Opus-class model first", () => {
    const ranked = rankModels([
      "openai/gpt-5",
      "anthropic/claude-sonnet-5.5",
      "anthropic/claude-opus-5.5",
      "anthropic/claude-haiku-5.5",
    ]);
    expect(ranked[0]).toBe("anthropic/claude-opus-5.5");
    expect(ranked[1]).toBe("anthropic/claude-sonnet-5.5");
  });
});

describe("the writing effort", () => {
  const tags = emptyTask("observer");

  it("is the schedule's param, and Standard is its absence", () => {
    expect(observerEffort(readTask(tags))).toBe("standard");
    const deep = withObserverEffort(tags, "deep");
    expect(observerEffort(readTask(deep))).toBe("deep");
    expect(
      readTask(deep)
        .params.filter((p) => p.name === EFFORT_PARAM)
        .map((p) => p.values),
    ).toEqual([["deep"]]);
    // Understood here: quartz 2.17.0 lists it among the known params.
    expect(KNOWN_PARAMS).toContain("effort");
    expect(observerUnderstands(readTask(deep))).toBe(true);
    expect(unknownObserverParams(readTask(deep))).toEqual([]);
    const standard = withObserverEffort(deep, "standard");
    expect(readTask(standard).params.some((p) => p.name === EFFORT_PARAM)).toBe(false);
    expect(effortOf("high")).toBe("standard");
    expect(effortOf(" Deep ")).toBe("deep");
  });

  it("counts in the estimate: both passes, the full block, and Deep's reasoning", () => {
    const standard = editionTokens(200_000, 50_000);
    const prompt = approxTokens(250_000);
    expect(standard.prompt).toBe(2 * prompt + approxTokens(60_000));
    expect(standard.completion).toBe(4_000 + EXPECTED_OUTPUT_TOKENS);
    expect(standard.requests).toBe(2);
    const deep = editionTokens(200_000, 50_000, "deep");
    expect(deep.completion - standard.completion).toBe(2 * DEEP_REASONING_TOKENS);
    // Each of the two requests pays a node's per-request fee.
    expect(estimateCost({ prompt: 0, completion: 0, request: 3, maxCost: null }, standard)).toBe(6);
    expect(estimateCost({ prompt: 0, completion: 0, request: 3, maxCost: null }, { prompt: 0, completion: 0 })).toBe(3);
  });
});
