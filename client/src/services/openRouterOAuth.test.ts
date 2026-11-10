import { afterEach, describe, expect, it, vi } from "vitest";
import { keepPending } from "@/lib/openRouterOAuth";
import { completeOpenRouterConnect, startOpenRouterConnect } from "./openRouterOAuth";

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("Connect with OpenRouter", () => {
  it("keeps a verifier and state, then sends the tab to OpenRouter", async () => {
    const assign = vi.fn();
    expect(await startOpenRouterConnect(assign)).toBe(true);
    const url = new URL(assign.mock.calls[0][0] as string);
    expect(url.searchParams.get("callback_url")).toBe(`${window.location.origin}/settings/openrouter`);
    const pending = JSON.parse(window.sessionStorage.getItem("brainstorm:openrouter-oauth")!);
    expect(url.searchParams.get("state")).toBe(pending.state);
    expect(url.searchParams.get("code_challenge")).not.toBe(pending.verifier);
  });

  it("trades the code and verifier for a key, once per callback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ key: "sk-or-v1-new" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    keepPending({ verifier: "VER", state: "ST" });

    const first = completeOpenRouterConnect("?code=CODE&state=ST");
    const again = completeOpenRouterConnect("?code=CODE&state=ST");
    expect(await first).toEqual({ key: "sk-or-v1-new" });
    expect(await again).toEqual({ key: "sk-or-v1-new" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(JSON.parse(init.body as string)).toEqual({
      code: "CODE",
      code_verifier: "VER",
      code_challenge_method: "S256",
    });
  });

  it("never sends a code whose state doesn't match", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    keepPending({ verifier: "VER", state: "ST" });

    expect(await completeOpenRouterConnect("?code=CODE2&state=FORGED")).toEqual({ error: "mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a network failure as failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    keepPending({ verifier: "VER", state: "ST" });
    expect(await completeOpenRouterConnect("?code=CODE3&state=ST")).toEqual({ error: "failed" });
  });
});
