import { describe, expect, it } from "vitest";
import {
  authHeaders,
  chatRequest,
  extractDocument,
  parseStreamLine,
  rankModels,
  readCompletion,
  readModelIds,
  repairMessage,
  systemPrompt,
  userMessage,
} from "./writer";

const openRouter = { key: "sk-or-v1-x", url: "https://openrouter.ai/api/v1" };
const anthropic = { key: "sk-ant-x", url: "https://api.anthropic.com/v1" };

describe("the prompt", () => {
  it("is the corrected brief plus the light-only house stylesheet", () => {
    const prompt = systemPrompt();
    expect(prompt).toMatch(/Corrections for this harness/);
    expect(prompt).toMatch(/You are the editor of a one-reader daily newspaper/);
    expect(prompt).toMatch(/color-scheme: light/);
    // The paper is always newsprint: no dark theme can reach the frame.
    expect(prompt).not.toMatch(/@media \(prefers-color-scheme: dark\)/);
    expect(prompt).not.toMatch(/data-theme="dark"\] \{/);
  });

  it("delimits the corpus as data and keeps the reader's name outside it", () => {
    const message = userMessage("THE DIGEST", "Vitor");
    expect(message).toMatch(/<corpus>\nTHE DIGEST\n<\/corpus>/);
    expect(message.indexOf("Reader: Vitor")).toBeLessThan(message.indexOf("<corpus>"));
  });

  it("names the reader's language outside the corpus, and only when there is one", () => {
    const message = userMessage("THE DIGEST", "Vitor", "pt-BR");
    expect(message.indexOf("Language: pt-BR")).toBeLessThan(message.indexOf("<corpus>"));
    expect(userMessage("THE DIGEST", "Vitor", null)).not.toMatch(/Language:/);
  });

  it("the repair message lists every violation", () => {
    const text = repairMessage([{ kind: "QUOTE", detail: "not found verbatim", excerpt: "made up" }]);
    expect(text).toMatch(/- QUOTE: not found verbatim\n {2}made up/);
  });
});

describe("the request", () => {
  it("is Chat Completions with a bearer key", () => {
    const { url, init } = chatRequest(openRouter, "anthropic/claude-sonnet-4.5", [], true);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-x");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "anthropic/claude-sonnet-4.5",
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(body.max_tokens).toBeUndefined();
  });

  it("tells Anthropic it is a web page calling it directly, and asks for room", () => {
    expect(authHeaders(anthropic)).toMatchObject({
      "x-api-key": "sk-ant-x",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(JSON.parse(chatRequest(anthropic, "m", [], false).init.body as string).max_tokens).toBeGreaterThan(8000);
  });

  it("a keyless local runner sends no Authorization", () => {
    expect(authHeaders({ key: "", url: "http://localhost:11434/v1" })).toEqual({});
  });
});

describe("the answer", () => {
  it("reads a stream line by line, with usage and [DONE]", () => {
    expect(parseStreamLine('data: {"choices":[{"delta":{"content":"<p>"}}]}').text).toBe("<p>");
    expect(parseStreamLine('data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}').usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
    });
    expect(parseStreamLine("data: [DONE]").done).toBe(true);
    expect(parseStreamLine(": keep-alive").text).toBe("");
    expect(parseStreamLine("data: {broken").text).toBe("");
  });

  it("reads a non-streamed answer", () => {
    expect(readCompletion({ choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 1 } })).toEqual({
      text: "hi",
      usage: { promptTokens: 1, completionTokens: null },
    });
  });

  it("strips a fence or a preamble around the document", () => {
    expect(extractDocument("```html\n<!doctype html><html><body>x</body></html>\n```")).toBe(
      "<!doctype html><html><body>x</body></html>",
    );
    expect(extractDocument("Here is your paper:\n<!DOCTYPE html><html></html>\nEnjoy!")).toBe(
      "<!DOCTYPE html><html></html>",
    );
  });
});

describe("choosing a model", () => {
  it("prefers a strong long-form writer, newest first, and never a non-chat model", () => {
    const ranked = rankModels([
      "text-embedding-3-large",
      "openai/gpt-4o-mini",
      "anthropic/claude-haiku-4.5",
      "anthropic/claude-sonnet-4",
      "anthropic/claude-sonnet-4.5",
      "meta-llama/llama-3.1-8b-instruct",
      "whisper-1",
    ]);
    expect(ranked[0]).toBe("anthropic/claude-sonnet-4.5");
    expect(ranked[1]).toBe("anthropic/claude-sonnet-4");
    expect(ranked).not.toContain("text-embedding-3-large");
    expect(ranked).not.toContain("whisper-1");
    expect(ranked.indexOf("anthropic/claude-haiku-4.5")).toBeGreaterThan(ranked.indexOf("anthropic/claude-sonnet-4"));
  });

  it("reads both shapes of a model list", () => {
    expect(readModelIds({ data: [{ id: "a" }, { id: "b" }] })).toEqual(["a", "b"]);
    expect(readModelIds({ models: [{ name: "models/gemini-2.5-pro" }] })).toEqual(["gemini-2.5-pro"]);
    expect(readModelIds(null)).toEqual([]);
  });
});
