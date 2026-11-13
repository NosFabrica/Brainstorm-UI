/**
 * Which URL a saved key's calls go to, and what makes a key a Routstr key (round-2 audit,
 * from Amethyst's): anyone can announce any URL as kind 38421, so an announcement must never
 * steer a key's calls nor make a key a "Routstr key". Only the key's own URL is called, and
 * only that URL's own `/v1/info` or `/v1/models` says what it is. No network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nip19 } from "nostr-tools";
import type { NostrEvent } from "nostr-tools";

const REAL = "1".repeat(64);
const ATTACKER = "2".repeat(64);
const now = Math.floor(Date.now() / 1000);
/** An attacker's announcement naming the real node's URL, and their own beside it. */
const FAKE: NostrEvent = {
  id: "f".repeat(64),
  pubkey: ATTACKER,
  created_at: now,
  kind: 38421,
  tags: [
    ["d", "x"],
    ["u", "https://api.routstr.com"],
    ["u", "https://openrouter.ai/api"],
    ["u", "https://evil.example.org"],
  ],
  content: JSON.stringify({ name: "Routstr Official" }),
  sig: "",
};
vi.mock("@/lib/relayRequest", () => ({ requestAll: vi.fn(async () => [FAKE]) }));

const asked: { url: string; auth?: string }[] = [];
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

beforeEach(() => {
  asked.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      asked.push({ url, auth: (init.headers as Record<string, string> | undefined)?.Authorization });
      if (url.endsWith("/v1/balance/info")) return ok({ balance: 5_000_000, reserved: 0 });
      if (url === "https://api.routstr.com/v1/info") {
        return ok({ name: "Routstr", npub: nip19.npubEncode(REAL), mints: ["https://mint.example.org"] });
      }
      if (url === "https://node.example.org/v1/info") return ok({ name: "n", npub: nip19.npubEncode(REAL), mints: [] });
      if (url === "https://plain.example.org/v1/info") return new Response("{}", { status: 404 });
      if (url === "https://plain.example.org/v1/models") return ok({ data: [{ id: "gpt-x" }] });
      if (url === "https://priced.example.org/v1/models") {
        return ok({ data: [{ id: "m", sats_pricing: { prompt: 1, completion: 1 } }] });
      }
      if (url.endsWith("/v2/lightning/invoice")) {
        return ok({ invoice_id: "i", bolt11: "lnbc1", amount_sats: 1000, expires_at: now + 600, payment_hash: "h" });
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const load = () => import("./routstr");

describe("a saved key's calls go to its own URL only", () => {
  it("balance and top-up invoice for a key at api.routstr.com, with an announcement claiming that host in hand", async () => {
    const svc = await load();
    // The discovery ask returns the attacker's announcement; nothing below reads it.
    expect(await svc.loadRoutstrNodes()).toEqual([FAKE]);
    const entry = { key: `sk-${"a".repeat(64)}`, url: "https://api.routstr.com/v1" };
    await svc.getBalance(entry);
    await svc.refreshBalance(entry);
    await svc.createInvoice(entry.url, 1000, "topup", entry.key);
    expect(asked.map((a) => a.url)).toEqual([
      "https://api.routstr.com/v1/balance/info",
      "https://api.routstr.com/v1/balance/info",
      "https://api.routstr.com/v2/lightning/invoice",
    ]);
    expect(asked.every((a) => a.auth === `Bearer ${entry.key}`)).toBe(true);
  });
});

describe("what makes a key a Routstr key", () => {
  it("never a preset provider's URL, whatever was marked or announced", async () => {
    const svc = await load();
    const openrouter = "https://openrouter.ai/api/v1";
    svc.markRoutstr(openrouter);
    expect(svc.knownRoutstr(openrouter)).toBe(false);
    expect(await svc.detectRoutstr(openrouter)).toBe(false);
    expect(svc.knownRoutstr("https://api.anthropic.com/v1")).toBe(false);
    expect(asked).toEqual([]);
  });

  it("a URL becomes one only from its own /v1/info or /v1/models, never from a balance answer", async () => {
    const svc = await load();
    const node = "https://node.example.org/v1";
    expect(svc.knownRoutstr(node)).toBeUndefined();
    // A balance answer says nothing of what the URL is.
    await svc.getBalance({ key: "sk-x", url: node });
    expect(svc.knownRoutstr(node)).toBeUndefined();
    expect(await svc.detectRoutstr(node)).toBe(true);
    expect(asked.at(-1)!.url).toBe("https://node.example.org/v1/info");
    expect(svc.knownRoutstr(node)).toBe(true);

    expect(await svc.detectRoutstr("https://plain.example.org/v1")).toBe(false);
    await svc.getNodeModels("https://plain.example.org/v1");
    expect(svc.knownRoutstr("https://plain.example.org/v1")).toBeUndefined();
    await svc.getNodeModels("https://priced.example.org/v1");
    expect(svc.knownRoutstr("https://priced.example.org/v1")).toBe(true);
  });

  it("asks no reserved name, *.localhost included", async () => {
    const svc = await load();
    expect(await svc.detectRoutstr("https://node.localhost/v1")).toBe(false);
    expect(await svc.detectRoutstr("https://box.lan/v1")).toBe(false);
    expect(asked).toEqual([]);
  });

  it("whose node it is comes from the URL's own /v1/info: the real key, not the announcer's", async () => {
    const svc = await load();
    const { isVerified, nodesFrom } = await import("@/lib/routstr");
    const info = await svc.getNodeInfo("https://api.routstr.com/v1");
    expect(isVerified(info, ATTACKER)).toBe(false);
    expect(isVerified(info, REAL)).toBe(true);
    // Once asked, the attacker's claim to that URL drops out of the list.
    const { renderHook } = await import("@testing-library/react");
    const { result } = renderHook(() => svc.useConfirmedOwners());
    expect(result.current.get("https://api.routstr.com")).toBe(REAL);
    const listed = nodesFrom([FAKE], now, result.current).fresh;
    expect(listed.map((n) => n.https[0])).toEqual([]);
  });
});
