import { afterEach, describe, expect, it } from "vitest";
import {
  CONNECT_ERROR_TEXT,
  authUrl,
  base64Url,
  clearHandoff,
  codeChallenge,
  exchangeBody,
  handOff,
  keepPending,
  peekHandoff,
  randomToken,
  readCallback,
  readExchangeAnswer,
  takePending,
} from "./openRouterOAuth";

afterEach(() => {
  clearHandoff();
  window.sessionStorage.clear();
});

describe("PKCE", () => {
  it("derives the S256 challenge of RFC 7636's own example", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("makes url-safe, unpadded, distinct tokens", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
    expect(base64Url(new Uint8Array([251, 255]))).toBe("-_8");
  });

  it("sends the user to OpenRouter with the challenge, the state and Brainstorm's label", () => {
    const url = new URL(
      authUrl({ callbackUrl: "https://b.example/settings/openrouter", challenge: "CH", state: "ST" }),
    );
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      callback_url: "https://b.example/settings/openrouter",
      code_challenge: "CH",
      code_challenge_method: "S256",
      state: "ST",
      key_label: "Brainstorm",
    });
  });
});

describe("the callback", () => {
  it("accepts a code only with the state this tab sent", () => {
    expect(readCallback("?code=C1&state=S1", { state: "S1" })).toEqual({ code: "C1" });
    expect(readCallback("?code=C1&state=OTHER", { state: "S1" })).toEqual({ error: "mismatch" });
    expect(readCallback("?code=C1&state=S1", null)).toEqual({ error: "expired" });
    // OpenRouter drops the state when the user declines.
    expect(readCallback("?code=C1", { state: "S1" })).toEqual({ error: "declined" });
    expect(readCallback("", { state: "S1" })).toEqual({ error: "declined" });
  });

  it("reads the exchange's answer", () => {
    expect(readExchangeAnswer(200, { key: "sk-or-v1-x" })).toEqual({ key: "sk-or-v1-x" });
    expect(readExchangeAnswer(200, {})).toEqual({ error: "failed" });
    expect(readExchangeAnswer(400, { error: "invalid code" })).toEqual({ error: "expired" });
    expect(readExchangeAnswer(500, null)).toEqual({ error: "failed" });
    expect(JSON.parse(exchangeBody("C", "V"))).toEqual({
      code: "C",
      code_verifier: "V",
      code_challenge_method: "S256",
    });
  });

  it("forgets the pending sign-in once read", () => {
    expect(keepPending({ verifier: "V", state: "S" })).toBe(true);
    expect(takePending()).toEqual({ verifier: "V", state: "S" });
    expect(takePending()).toBeNull();
  });

  it("hands the outcome over in memory, never to storage", () => {
    handOff({ key: "sk-or-v1-secret" }, "aa");
    expect(peekHandoff("aa")).toEqual({ key: "sk-or-v1-secret" });
    // Kept for the account that signed in, and nobody else.
    expect(peekHandoff("bb")).toBeNull();
    expect(peekHandoff(null)).toBeNull();
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("sk-or-v1-secret");
    clearHandoff();
    expect(peekHandoff("aa")).toBeNull();
    expect(Object.keys(CONNECT_ERROR_TEXT)).toHaveLength(4);
  });
});
