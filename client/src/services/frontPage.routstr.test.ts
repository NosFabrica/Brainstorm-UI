/**
 * The writer with a Routstr key: the node's own errors in words (a 402 is a balance, not a
 * dead key), a 503 `payment_settlement_failed` never sent again, and the model list read
 * with its prices in sats. Every call is mocked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import modelsJson from "@/lib/__fixtures__/routstr/models.json";
import { WriterError, explain, fetchModelList, writePage } from "./frontPage";

const key = { key: `sk-${"c".repeat(64)}`, url: "https://routstr.example.org/v1" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("explain", () => {
  it("maps Routstr's errors, and leaves everyone else's as they were", () => {
    expect(
      explain(
        402,
        JSON.stringify({
          detail: { error: { code: "insufficient_balance", details: { shortfall_msats: 3_306_790 } } },
        }),
      ),
    ).toBe("Your Routstr balance is too low for this model: top up 3,307 sats.");
    expect(explain(401, JSON.stringify({ error: { code: "key_not_found", message: "Key not found." } }))).toMatch(
      /isn't on this node/,
    );
    expect(explain(424, JSON.stringify({ error: { code: "UPSTREAM_UNAVAILABLE" } }))).toMatch(/Nothing was spent/);
    expect(explain(429, JSON.stringify({ error: { code: "UPSTREAM_RATE_LIMIT" } }))).toMatch(/rate-limiting/);
    expect(explain(503, JSON.stringify({ error: { code: "payment_settlement_failed" } }))).toMatch(
      /charged for this answer but didn't send it/,
    );
    // Not Routstr's: the old words.
    expect(explain(401, JSON.stringify({ error: { code: "invalid_api_key" } }))).toMatch(/AI key was rejected/);
    expect(explain(402, "")).toBe("Your AI key is out of credit.");
    expect(explain(429, "")).toMatch(/rate-limiting this key/);
  });
});

describe("writePage with a Routstr key", () => {
  it("never sends again after a 503 payment_settlement_failed", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json(503, { detail: { error: { code: "payment_settlement_failed", message: "Settlement failed" } } }),
      );
    vi.stubGlobal("fetch", fetch);
    const err = await writePage({ key, model: "claude-sonnet-5.5", messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(WriterError);
    expect(err.status).toBe(503);
    expect(err.message).toMatch(/isn't sent again/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a 402 is a balance to top up, said once, with no second request", async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(402, {
        error: {
          type: "insufficient_quota",
          code: "insufficient_balance",
          details: { required_msats: 4_306_790, available_msats: 1_000_000, shortfall_msats: 3_306_790 },
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(
      "Your Routstr balance is too low for this model: top up 3,307 sats.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("names a key from another node, from a live node's body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(401, {
          detail: { error: { message: "Key not found.", type: "invalid_request_error", code: "key_not_found" } },
          error: { message: "Key not found.", type: "invalid_request_error", code: "key_not_found" },
        }),
      ),
    );
    await expect(writePage({ key, model: "m", messages: [] })).rejects.toThrow(/isn't on this node/);
  });
});

describe("fetchModelList", () => {
  it("keeps a Routstr node's prices beside the ids", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, modelsJson)));
    const list = await fetchModelList(key);
    expect(list.ids).toContain("claude-sonnet-5.5");
    expect(list.routstr?.find((m) => m.id === "claude-sonnet-5.5")?.sats?.prompt).toBeGreaterThan(0);
  });

  it("is null for an endpoint without sats_pricing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, { data: [{ id: "gpt-5" }] })));
    expect(await fetchModelList({ key: "sk", url: "https://api.openai.com/v1" })).toEqual({
      ids: ["gpt-5"],
      routstr: null,
      limits: new Map(),
    });
  });
});
