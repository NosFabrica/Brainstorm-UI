// @vitest-environment node
/**
 * The AI agent keys format (kind 12000), shared with Amethyst through Quartz's
 * `AgentKeyEvent`. Node, not jsdom: the vector is really verified and decrypted
 * (jsdom's foreign-realm Uint8Array fails @noble's checks, see `test/setup.ts`).
 */
import { describe, expect, it } from "vitest";
import { getPublicKey, verifyEvent } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";
import {
  AGENT_KEYS_KIND,
  addKey,
  apiRoot,
  isSecureAgentUrl,
  decodePrivateTags,
  makePreferred,
  maskKey,
  modelsRequest,
  normalizeAgentUrl,
  parseAgentKeys,
  providerName,
  readTestAnswer,
  testCaption,
  presetForUrl,
  removeKey,
  withAgentKeys,
} from "./agentKeys";

/**
 * Quartz's `AgentKeyVectorTest`: signed and encrypted by the test key 0x…01, never a
 * real secret. Every implementation reads the same two keys from it.
 */
const VECTOR = {
  id: "c537202a5eddcfda27fbc08a35c4e3a58bb5fcc92bdae3aa755937c1c06dea9f",
  pubkey: "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  created_at: 1794268800,
  kind: 12000,
  tags: [],
  content:
    "AocRCX76hiVQkrvxAkl1KTue2UXLl47wPFc3b2EKrGASx724fGgVynMNpMGesy2sxZ3PWbxeb+kL2GFMotOTF9kAjWHvPf0drJYFXatYdSvagXi4VbsUJYaZBZ+vb1iVPRDsgSbBVdIfoSNH7JEYiqGP6vYsp8NCaJQ4zgGowCsAgvyirwCRD90EYYkGql7921doW1Qel6u/UX44S5ea+Yyf/VPEsLwkWbUk4dPBcwsuvXBIcF090noeyXW1nN+H4MmU",
  sig: "248807f9e11a6651ca4af9bf2689fc2f4520b9f690977d555df71df8e4733c60b4ba9e18e37fb72064f0604a7f6749c968beb96eb96779d0f14ed4b697c67a42",
};
const TEST_KEY = new Uint8Array(32);
TEST_KEY[31] = 1;

const openRouter = { key: "sk-or-v1-abcdef0123456789", url: "https://openrouter.ai/api/v1" };
const ollama = { key: "", url: "http://localhost:11434/v1" };
const anthropic = { key: "sk-ant-api03-zzzzzzzzzzzz", url: "https://api.anthropic.com/v1" };

describe("the shared vector", () => {
  it("verifies, and decrypts with the test key to the same two keys Quartz reads", () => {
    expect(verifyEvent({ ...VECTOR })).toBe(true);
    expect(VECTOR.kind).toBe(AGENT_KEYS_KIND);
    expect(getPublicKey(TEST_KEY)).toBe(VECTOR.pubkey);

    const plain = nip44.decrypt(VECTOR.content, nip44.getConversationKey(TEST_KEY, VECTOR.pubkey));
    const tags = decodePrivateTags(plain);

    expect(tags).toEqual([
      ["key", "sk-or-v1-test-vector-not-a-real-key", "https://openrouter.ai/api/v1"],
      ["key", "", "http://localhost:11434/v1"],
    ]);
    expect(parseAgentKeys(tags!)).toEqual([
      { key: "sk-or-v1-test-vector-not-a-real-key", url: "https://openrouter.ai/api/v1" },
      { key: "", url: "http://localhost:11434/v1" },
    ]);
  });
});

describe("reading the private tags", () => {
  it("keeps the order and skips malformed key tags", () => {
    const tags = [
      ["key", "only-a-key"],
      ["key", "blank-url", "  "],
      ["model", "x", "https://x"],
      ["key", "sk-good", "https://api.example.com/v1", "extra"],
      ["key", "", "http://localhost:1234/v1"],
    ];
    expect(parseAgentKeys(tags)).toEqual([
      { key: "sk-good", url: "https://api.example.com/v1", extra: ["extra"] },
      { key: "", url: "http://localhost:1234/v1" },
    ]);
  });

  it("never uses a key that would travel in cleartext (NIP-FA: https, loopback, or no key)", () => {
    expect(
      parseAgentKeys([
        ["key", "sk-leak", "http://llm.example.org/v1"],
        ["key", "sk-local", "http://127.0.0.1:8080/v1"],
        ["key", "sk-local6", "http://[::1]:8080/v1"],
        ["key", "", "http://lan-box:11434/v1"],
      ]).map((k) => k.key),
    ).toEqual(["sk-local", "sk-local6", ""]);
    expect(isSecureAgentUrl("http://localhost.evil.example/v1", "sk")).toBe(false);
  });

  it("refuses content that isn't a list of string tags", () => {
    expect(decodePrivateTags("not json")).toBeNull();
    expect(decodePrivateTags('{"key":"x"}')).toBeNull();
    expect(decodePrivateTags('[["key", 1, "https://x"]]')).toBeNull();
    expect(decodePrivateTags("[]")).toEqual([]);
  });
});

describe("rewriting", () => {
  it("puts the keys first and keeps every tag that isn't a key", () => {
    const before = [
      ["key", "old", "https://old.example/v1"],
      ["model", "anthropic/claude"],
      ["x", "y"],
    ];
    expect(withAgentKeys(before, [anthropic, ollama])).toEqual([
      ["key", anthropic.key, anthropic.url],
      ["key", "", ollama.url],
      ["model", "anthropic/claude"],
      ["x", "y"],
    ]);
  });

  it("keeps extra values, and key tags it couldn't use, through an edit (NIP-FA Editing)", () => {
    const before = [
      ["key", "sk-a", "https://a.example/v1", "label", "future"],
      ["key", "only-a-key"],
      ["key", "sk-leak", "http://llm.example.org/v1"],
      ["model", "x"],
    ];
    const keys = parseAgentKeys(before);
    expect(withAgentKeys(before, makePreferred(addKey(keys, ollama), ollama))).toEqual([
      ["key", "", ollama.url],
      ["key", "sk-a", "https://a.example/v1", "label", "future"],
      ["key", "only-a-key"],
      ["key", "sk-leak", "http://llm.example.org/v1"],
      ["model", "x"],
    ]);
    // Removing the one it can use leaves the ones it can't.
    expect(withAgentKeys(before, removeKey(keys, keys[0]))).toEqual([
      ["key", "only-a-key"],
      ["key", "sk-leak", "http://llm.example.org/v1"],
      ["model", "x"],
    ]);
  });

  it("adds at the end without duplicates, moves one to the front, and removes one", () => {
    const keys = addKey(addKey([], openRouter), ollama);
    expect(keys).toEqual([openRouter, ollama]);
    expect(addKey(keys, { ...openRouter })).toBe(keys);
    expect(makePreferred(keys, ollama)).toEqual([ollama, openRouter]);
    expect(removeKey(keys, openRouter)).toEqual([ollama]);
  });
});

describe("display", () => {
  it("masks keys so two can be told apart and none can be used", () => {
    expect(maskKey(openRouter.key)).toBe("sk-or-…6789");
    expect(maskKey("")).toBe("No key");
    expect(maskKey("short")).toBe("••••");
  });

  it("names the provider from the URL", () => {
    expect(providerName("https://openrouter.ai/api/v1")).toBe("OpenRouter");
    expect(providerName("http://localhost:11434/v1")).toBe("Ollama");
    expect(providerName("https://llm.example.org/v1")).toBe("llm.example.org");
  });

  it("stores URLs without a trailing slash, and only http(s); plain http only for this computer or no key", () => {
    expect(normalizeAgentUrl(" https://api.example.com/v1/ ", "sk")).toBe("https://api.example.com/v1");
    expect(normalizeAgentUrl("ftp://x", "")).toBeNull();
    expect(normalizeAgentUrl("nope", "")).toBeNull();
    expect(normalizeAgentUrl("http://llm.example.org/v1", "sk")).toBeNull();
    expect(normalizeAgentUrl("http://llm.example.org/v1", "")).toBe("http://llm.example.org/v1");
    expect(normalizeAgentUrl("http://localhost:11434/v1", "sk")).toBe("http://localhost:11434/v1");
  });

  it("calls the URL without its one trailing slash", () => {
    expect(apiRoot("https://a.example/v1/")).toBe("https://a.example/v1");
    expect(modelsRequest({ key: "", url: "https://a.example/v1/" }).url).toBe("https://a.example/v1/models");
  });
});

describe("testing a key", () => {
  it("never puts a key on a cleartext request", () => {
    expect(modelsRequest({ key: "sk-x", url: "http://llm.example.org/v1" }).headers).toEqual({});
  });

  it("asks for the model list with the key as a bearer token, and no header without one", () => {
    expect(modelsRequest({ key: "sk-x", url: "https://api.openai.com/v1" })).toEqual({
      url: "https://api.openai.com/v1/models",
      headers: { Authorization: "Bearer sk-x" },
      keyChecked: true,
    });
    expect(modelsRequest(ollama)).toEqual({ url: "http://localhost:11434/v1/models", headers: {}, keyChecked: true });
  });

  it("checks a key where the model list is public", () => {
    // OpenRouter, Venice and NEAR list models for anyone; these calls 401 on a bad key.
    expect(modelsRequest(openRouter).url).toBe("https://openrouter.ai/api/v1/key");
    expect(modelsRequest({ key: "k", url: "https://api.venice.ai/api/v1" }).url).toBe(
      "https://api.venice.ai/api/v1/api_keys/rate_limits",
    );
    expect(modelsRequest({ key: "k", url: "https://cloud-api.near.ai/v1" }).url).toBe(
      "https://cloud-api.near.ai/v1/users/me",
    );
    // PPQ has no such call: it answers, but the key isn't checked.
    const ppq = modelsRequest({ key: "k", url: "https://api.ppq.ai/v1" });
    expect(ppq.keyChecked).toBe(false);
    expect(readTestAnswer(200, { data: [{}] }, ppq.keyChecked)).toEqual({ status: "ok", models: 1, unverified: true });
  });

  it("tells Anthropic it is a web page calling it directly", () => {
    const { headers } = modelsRequest(anthropic);
    expect(headers["x-api-key"]).toBe(anthropic.key);
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("reads the answer", () => {
    expect(readTestAnswer(200, { data: [{}, {}] })).toEqual({ status: "ok", models: 2 });
    expect(readTestAnswer(200, { models: [{}] })).toEqual({ status: "ok", models: 1 });
    expect(readTestAnswer(200, null)).toEqual({ status: "ok", models: null });
    expect(readTestAnswer(401, null)).toEqual({ status: "rejected" });
    expect(readTestAnswer(403, null)).toEqual({ status: "rejected" });
    expect(readTestAnswer(404, null)).toEqual({ status: "failed", httpStatus: 404 });
    // xAI and Gemini answer a bad key with 400.
    expect(readTestAnswer(400, { error: "Incorrect API key provided." })).toEqual({ status: "rejected" });
    expect(readTestAnswer(400, { error: { message: "Please pass a valid API key" } })).toEqual({ status: "rejected" });
    expect(readTestAnswer(400, { error: "model is required" })).toEqual({ status: "failed", httpStatus: 400 });
  });
});

describe("the test caption", () => {
  it("is a few words, never a sentence", () => {
    expect(testCaption({ status: "ok", models: 312 })).toEqual({ tone: "ok", text: "Works · 312 models" });
    expect(testCaption({ status: "ok", models: 1 }).text).toBe("Works · 1 model");
    expect(testCaption({ status: "ok", models: null }).text).toBe("Works");
    expect(testCaption({ status: "ok", models: 5, unverified: true })).toEqual({
      tone: "unchecked",
      text: "Answered, key unchecked",
    });
    expect(testCaption({ status: "rejected" })).toEqual({ tone: "rejected", text: "Key rejected" });
    expect(testCaption({ status: "unreachable" })).toEqual({ tone: "problem", text: "Can't reach it" });
    expect(testCaption({ status: "failed", httpStatus: 500 }).text).toBe("Error 500");
  });

  it("finds a stored URL's preset by host", () => {
    expect(presetForUrl("https://openrouter.ai/api/v1")?.keyPage).toBe("https://openrouter.ai/keys");
    expect(presetForUrl("https://example.com/v1")).toBeUndefined();
  });
});
