/**
 * Routstr's formats, against what live nodes sent on 2026-11-13: the 82 kind 38421
 * announcements the discovery relays held, a live node's `/v1/info` and `/v1/models`
 * (trimmed to five entries), its openapi.json, and the error bodies it answered with.
 */
import { describe, expect, it } from "vitest";
import type { NostrEvent } from "nostr-tools";
import { nip19 } from "nostr-tools";
import announcements from "@/lib/__fixtures__/routstr/announcements.json";
import openapi from "@/lib/__fixtures__/routstr/openapi.json";
import modelsJson from "@/lib/__fixtures__/routstr/models.json";
import infoJson from "@/lib/__fixtures__/routstr/info.json";
import {
  FRESH_SECONDS,
  LISTED_MAX_AGE,
  infoOwner,
  ROUTSTR_KIND,
  cashuToken,
  estimateSats,
  formatSats,
  isRoutstrModels,
  isVerified,
  looksLikeRoutstrKey,
  lowBalance,
  nodeApiUrl,
  nodeBase,
  nodesFrom,
  parseAnnouncement,
  parseBalance,
  parseInfo,
  parseInvoice,
  parseInvoiceStatus,
  parseModels,
  readCreated,
  readRoutstrError,
  readTopup,
  routstrProblem,
  satsNeeded,
  searchNodes,
  textModels,
  usableBase,
} from "./routstr";

const EVENTS = announcements as NostrEvent[];
/** 2026-11-13 00:00 UTC: the day the fixtures were taken. */
const NOW = 1794528000;

describe("kind 38421 announcements (82 live ones)", () => {
  it("reads every one without throwing, and only Routstr's kind", () => {
    expect(EVENTS).toHaveLength(82);
    const parsed = EVENTS.map(parseAnnouncement);
    expect(parsed.every((n) => n !== null)).toBe(true);
    for (const node of parsed) {
      expect(node!.name.length).toBeGreaterThan(0);
      for (const url of node!.https) {
        expect(url.startsWith("https://")).toBe(true);
        expect(url.endsWith("/")).toBe(false);
        expect(url).not.toMatch(/\.onion|\.fips|^https:\/\/\d+\.\d+\.\d+\.\d+/);
      }
    }
    expect(parseAnnouncement({ ...EVENTS[0], kind: 1 })).toBeNull();
    expect(EVENTS.every((e) => e.kind === ROUTSTR_KIND)).toBe(true);
  });

  it("reads the content's name and about, mints, version and the rare models tag", () => {
    const thefux = parseAnnouncement(EVENTS.find((e) => e.content.includes('"thefux"'))!)!;
    expect(thefux.name).toBe("thefux");
    expect(thefux.about).toBe("Thefux Provider");
    expect(thefux.https).toEqual(["https://routstr.otrta.me"]);
    expect(thefux.onion).toBe(true);
    expect(thefux.mints).toContain("https://mint.minibits.cash/Bitcoin");
    expect(thefux.version).toBe("0.5.1+gd980acc");
    expect(thefux.models).toBeNull();
    const withModels = EVENTS.map(parseAnnouncement).filter((n) => n!.models);
    expect(withModels).toHaveLength(1);
    expect(withModels[0]!.models).toContain("claude-sonnet-5.5");
  });

  it("keeps the newest per address, one node per announcer and endpoint, and only nodes a browser can call", () => {
    // Against a clock before any of them, nothing is too old to list.
    const every = nodesFrom(EVENTS, 0);
    const listed = [...every.fresh, ...every.stale];
    // 79 addresses; 24 announce no https endpoint (onion, fips, http, IP only); 52 distinct
    // endpoints, two of them announced by two keys each: four entries, each marked contested.
    expect(listed).toHaveLength(54);
    expect(new Set(listed.map((n) => n.https[0])).size).toBe(52);
    expect(listed.filter((n) => n.contested)).toHaveLength(4);
    const { fresh, stale } = nodesFrom(EVENTS, NOW);
    const all = [...fresh, ...stale];
    // routstr.otrta.me is announced twice by one key: the newer copy is the one kept.
    const otrta = all.filter((n) => n.https[0] === "https://routstr.otrta.me");
    expect(otrta).toHaveLength(1);
    expect(otrta[0].seenAt).toBe(
      Math.max(...EVENTS.filter((e) => e.content.includes('"thefux"')).map((e) => e.created_at)),
    );
    // Fresh first, newest first.
    for (let i = 1; i < all.length; i++) {
      if (i !== fresh.length) expect(all[i - 1].seenAt).toBeGreaterThanOrEqual(all[i].seenAt);
    }
  });

  it("lists nothing not seen for 30 days (14 of the 52 endpoints on the day)", () => {
    const { fresh, stale } = nodesFrom(EVENTS, NOW);
    const all = [...fresh, ...stale];
    expect(all).toHaveLength(14);
    expect(all.every((n) => NOW - n.seenAt <= LISTED_MAX_AGE)).toBe(true);
    expect(LISTED_MAX_AGE).toBe(30 * 86400);
    const older = EVENTS.filter((e) => NOW - e.created_at > LISTED_MAX_AGE).map((e) => e.id);
    expect(older.length).toBeGreaterThan(0);
    expect(all.some((n) => older.includes(n.id))).toBe(false);
  });

  it("hides nodes not seen for a week (live, only one https node had announced this week)", () => {
    const { fresh, stale } = nodesFrom(EVENTS, NOW);
    expect(fresh.map((n) => n.name)).toEqual(["thefux"]);
    expect(stale.every((n) => NOW - n.seenAt > FRESH_SECONDS)).toBe(true);
    // A day later the same set reads a day older.
    expect(nodesFrom(EVENTS, NOW + 8 * 86400).fresh).toHaveLength(0);
    // Nodes a week older count as fresh against an earlier clock.
    expect(nodesFrom(EVENTS, NOW - 86400 * 2).fresh.length).toBeGreaterThan(1);
  });

  it("searches by name, about and host", () => {
    const { fresh, stale } = nodesFrom(EVENTS, NOW);
    const all = [...fresh, ...stale];
    expect(searchNodes(all, "brrr").map((n) => n.https[0])).toEqual(["https://routstr.nostrnative.com"]);
    expect(searchNodes(all, "OTRTA")).toHaveLength(1);
    expect(searchNodes(all, "")).toBe(all);
  });
});

describe("which endpoints a browser may call", () => {
  it("takes https only, normalized to the node's base", () => {
    expect(usableBase("https://api.routstr.com/")).toBe("https://api.routstr.com");
    expect(usableBase(" https://Routstr.Example.org/v1/ ")).toBe("https://routstr.example.org");
    expect(usableBase("https://bartly.eth64.de:17881")).toBe("https://bartly.eth64.de:17881");
    expect(usableBase("https://node.example.com/routstr")).toBe("https://node.example.com/routstr");
  });

  it("never a reserved or private-use name, as Quartz's RoutstrEndpoint refuses them", () => {
    for (const host of [
      "node.localhost",
      "a.b.localhost",
      "routstr.local",
      "node.internal",
      "box.lan",
      "nas.home",
      "node.test",
      "node.invalid",
      "routstr.example",
      "1.0.168.192.in-addr.arpa",
      "npub1x.fips",
      "node.localdomain",
      "node.intranet",
      "node.corp",
      "node.private",
      "routstr.local.",
    ]) {
      expect(usableBase(`https://${host}`), host).toBeNull();
      expect(usableBase(`https://${host}`, { typed: true }), host).toBeNull();
    }
    // A public name that merely contains one of those words is fine.
    expect(usableBase("https://localhost.example.org")).toBe("https://localhost.example.org");
    expect(usableBase("https://test.routstr.com")).toBe("https://test.routstr.com");
  });

  it("never plain http, onion (no Tor in a page), fips hosts, a bare name, localhost or credentials", () => {
    for (const url of [
      "http://routstr.example.org",
      "http://zdnt2juw6htljsu25ftnbvdicgvr4s3ts4ldlx2myjcuyz4woaf4l7id.onion",
      "https://zdnt2juw6htljsu25ftnbvdicgvr4s3ts4ldlx2myjcuyz4woaf4l7id.onion",
      "http://npub15eparr6gjryvprzs20xnvv78mmj4p38439tsu3u535mr4ehgj6ksy0z6fx.fips:5679/routstr",
      "https://npub1pxd3pll90t2n8hd6ntcpx27wzr9yws4hspzfxfhg5329qkjnx2aqfmya5a.fips:28080",
      "http://paygate:8000",
      "https://paygate",
      "https://localhost:8000",
      "https://user:pass@routstr.example.org",
      "ftp://routstr.example.org",
      "not a url",
    ]) {
      expect(usableBase(url), url).toBeNull();
    }
  });

  it("an IP-literal https host only when the reader typed it", () => {
    expect(usableBase("https://140.245.192.194")).toBeNull();
    expect(usableBase("https://140.245.192.194", { typed: true })).toBe("https://140.245.192.194");
    expect(usableBase("https://[2001:db8::1]")).toBeNull();
    expect(usableBase("http://140.245.192.194", { typed: true })).toBeNull();
  });

  it("maps a base to its NIP-FA URL and back", () => {
    expect(nodeApiUrl("https://routstr.otrta.me")).toBe("https://routstr.otrta.me/v1");
    expect(nodeBase("https://routstr.otrta.me/v1")).toBe("https://routstr.otrta.me");
    expect(nodeBase("https://routstr.otrta.me/v1/")).toBe("https://routstr.otrta.me");
  });
});

describe("/v1/info", () => {
  it("reads a live node's info, onion URL bare as it comes", () => {
    const info = parseInfo(infoJson)!;
    expect(info.name).toBe("Sats Go Brrr Token Emporium");
    expect(info.mints).toHaveLength(3);
    expect(info.onionUrl).toBeNull();
    expect(parseInfo({ name: "openai" })).toBeNull();
    expect(parseInfo({ npub: "npub1x", mints: "no" })).toBeNull();
  });

  it("is Verified only when its npub is the announcing key", () => {
    const info = parseInfo(infoJson)!;
    const announcer = EVENTS.find((e) => e.tags.some((t) => t[1] === "https://routstr.nostrnative.com"))!.pubkey;
    expect(isVerified(info, announcer)).toBe(true);
    expect(isVerified(info, "ab".repeat(32))).toBe(false);
    expect(isVerified({ ...info, npub: "npub1garbage" }, announcer)).toBe(false);
    expect(isVerified(null, announcer)).toBe(false);
  });
});

describe("/v1/models and the sats estimate", () => {
  const models = parseModels(modelsJson);
  const tokens = { prompt: 60_000, completion: 14_000 };

  it("reads both price sets, numbers or OpenRouter's strings, and tells writers from embeddings", () => {
    expect(isRoutstrModels(modelsJson)).toBe(true);
    expect(isRoutstrModels({ data: [{ id: "gpt-4o", pricing: { prompt: "0.0000025" } }] })).toBe(false);
    expect(models.map((m) => m.id).sort()).toEqual(
      ["bge-m3", "claude-opus-5.5", "claude-sonnet-5.5", "deepseek-v4-pro", "gpt-4o-mini"].sort(),
    );
    expect(textModels(models).map((m) => m.id)).not.toContain("bge-m3");
    const sonnet = models.find((m) => m.id === "claude-sonnet-5.5")!;
    expect(sonnet.sats).toMatchObject({ request: 0.001 });
    expect(sonnet.sats!.maxCost).toBeCloseTo(4306.79, 1);
    expect(sonnet.maxCompletionTokens).toBe(128000);
    const strings = parseModels({
      data: [{ id: "m", sats_pricing: { prompt: "0.5", completion: "1", max_cost: "100" } }],
    });
    expect(strings[0].sats).toEqual({ prompt: 0.5, completion: 1, request: 0, maxCost: 100 });
  });

  it("is prompt × prompt + completion × completion + request, rounded up", () => {
    const sonnet = models.find((m) => m.id === "claude-sonnet-5.5")!;
    const exact = 60_000 * sonnet.sats!.prompt + 14_000 * sonnet.sats!.completion + sonnet.sats!.request;
    expect(estimateSats(sonnet, tokens)).toBe(Math.ceil(exact));
    // 60k in at ~0.00285 sat and 14k out at ~0.0142 sat: about 370 sats.
    expect(estimateSats(sonnet, tokens)).toBe(371);
    const mini = models.find((m) => m.id === "gpt-4o-mini")!;
    expect(estimateSats(mini, tokens)).toBe(25);
    expect(estimateSats({ ...mini, sats: null }, tokens)).toBeNull();
    expect(formatSats(371)).toBe("371 sats");
    expect(formatSats(1)).toBe("1 sat");
    expect(formatSats(20000)).toBe("20,000 sats");
  });

  it("needs the node's max_cost on the balance, not just the estimate", () => {
    const sonnet = models.find((m) => m.id === "claude-sonnet-5.5")!;
    expect(satsNeeded(sonnet, 371)).toBe(4307);
    const balance = parseBalance({ api_key: "sk-echoed", balance: 1_000_000, reserved: 0 })!;
    expect(lowBalance(balance, sonnet, 371)).toEqual({ low: true, needed: 4307, short: 3307 });
    expect(lowBalance({ ...balance, msats: 5_000_000 }, sonnet, 371).low).toBe(false);
    // Unknown prices or balance: no warning on a guess.
    expect(lowBalance(null, sonnet, 371).low).toBe(false);
    expect(lowBalance(balance, null, null).low).toBe(false);
  });
});

describe("the balance and the openapi shapes", () => {
  const schemas = (openapi as { components: { schemas: Record<string, { required?: string[] }> } }).components.schemas;

  it("reads /v1/balance/info as msats and never keeps the echoed key", () => {
    const b = parseBalance({ api_key: "sk-secret", balance: 12_345_678, reserved: 2000, total_requests: 4 })!;
    expect(b).toEqual({ msats: 12_345_678, reservedMsats: 2000, totalRequests: 4 });
    expect(JSON.stringify(b)).not.toContain("sk-secret");
    expect(parseBalance({ detail: "no" })).toBeNull();
  });

  it("reads an invoice and its status as the openapi requires them", () => {
    expect(schemas.InvoiceCreateResponse.required).toEqual([
      "invoice_id",
      "bolt11",
      "amount_sats",
      "expires_at",
      "payment_hash",
    ]);
    expect(schemas.InvoiceStatusResponse.required).toEqual(["status", "amount_sats", "created_at", "expires_at"]);
    const invoice = parseInvoice({
      invoice_id: "inv_1",
      bolt11: "lnbc50u1fake",
      amount_sats: 5000,
      expires_at: NOW + 600,
      payment_hash: "ff",
    });
    expect(invoice).toEqual({
      invoiceId: "inv_1",
      bolt11: "lnbc50u1fake",
      amountSats: 5000,
      expiresAt: NOW + 600,
      paymentHash: "ff",
    });
    expect(parseInvoice({ invoice_id: "x", bolt11: "not-an-invoice", amount_sats: 1, expires_at: 1 })).toBeNull();
    expect(
      parseInvoiceStatus({ status: "PAID", api_key: "sk-abc", amount_sats: 5000, created_at: 1, expires_at: 2 }),
    ).toEqual({ status: "paid", apiKey: "sk-abc", expiresAt: 2, paidAt: null });
  });

  it("reads Cashu create and top-up, with the change a foreign mint hands back", () => {
    expect(schemas.BalanceCreateRequest.required).toEqual(["initial_balance_token"]);
    expect(schemas.TopupRequest.required).toEqual(["cashu_token"]);
    expect(readCreated({ api_key: "sk-new", balance: 21_000 })).toEqual({
      apiKey: "sk-new",
      msats: 21_000,
      change: null,
    });
    expect(
      readTopup({ msats: 20_000, change_token: "cashuBo2FteBpodHRwczovL21pbnQ", change_amount: 3, change_unit: "sat" }),
    ).toEqual({ msats: 20_000, change: { token: "cashuBo2FteBpodHRwczovL21pbnQ", amount: 3, unit: "sat" } });
    expect(readTopup({ msats: 20_000 }).change).toBeNull();
  });

  it("tells a Cashu token from a key", () => {
    expect(cashuToken("cashuBo2FteBpodHRwczovL21pbnQ")).toBe("cashuBo2FteBpodHRwczovL21pbnQ");
    expect(cashuToken(" cashu:cashuAeyJ0b2tlbiI6W3sibWludCI6 ")).toBe("cashuAeyJ0b2tlbiI6W3sibWludCI6");
    expect(cashuToken("sk-0123456789abcdef0123")).toBeNull();
    expect(cashuToken("cashuC123456789")).toBeNull();
    expect(looksLikeRoutstrKey("sk-" + "a".repeat(64))).toBe(true);
    expect(looksLikeRoutstrKey("cashuBo2FteBpodHRwczovL21pbnQ")).toBe(false);
  });
});

describe("error bodies", () => {
  // As a live node answered, 2026-11-13: both wrappings at once.
  const KEY_NOT_FOUND = {
    detail: {
      error: {
        message: "Key not found. Deposit first via /v1/wallet/create to get a key on this node.",
        type: "invalid_request_error",
        code: "key_not_found",
      },
    },
    error: {
      message: "Key not found. Deposit first via /v1/wallet/create to get a key on this node.",
      type: "invalid_request_error",
      code: "key_not_found",
    },
    request_id: "deef8a46",
  };
  // routstr-core's build_payment_required_error, under FastAPI's `detail`.
  const INSUFFICIENT = {
    detail: {
      error: {
        type: "insufficient_quota",
        code: "insufficient_balance",
        message: "Insufficient balance: 4306790 mSats required. 1000000 available.",
        details: { unit: "msat", required_msats: 4_306_790, available_msats: 1_000_000, shortfall_msats: 3_306_790 },
      },
    },
  };

  it('reads `{error}`, `{detail: {error}}`, `{detail: "…"}` and plain text', () => {
    expect(readRoutstrError(401, KEY_NOT_FOUND)).toMatchObject({
      code: "key_not_found",
      type: "invalid_request_error",
    });
    expect(readRoutstrError(401, { detail: KEY_NOT_FOUND.detail })).toMatchObject({ code: "key_not_found" });
    expect(readRoutstrError(401, { error: KEY_NOT_FOUND.error })).toMatchObject({ code: "key_not_found" });
    expect(readRoutstrError(400, { detail: "Invalid token format" })).toMatchObject({
      code: null,
      message: "Invalid token format",
    });
    expect(readRoutstrError(502, "error code: 502")).toMatchObject({ code: null, message: "error code: 502" });
    expect(readRoutstrError(402, JSON.stringify(INSUFFICIENT))).toMatchObject({
      code: "insufficient_balance",
      requiredMsats: 4_306_790,
      availableMsats: 1_000_000,
      shortfallMsats: 3_306_790,
    });
  });

  it("402 is a balance to top up, in sats, not a rejected key", () => {
    const p = routstrProblem(readRoutstrError(402, INSUFFICIENT))!;
    expect(p.kind).toBe("low-balance");
    expect(p.topUp).toBe(3307);
    expect(p.text).toBe("Your Routstr balance is too low for this model: top up 3,307 sats.");
    expect(p.text).not.toMatch(/reject/i);
    // Without a shortfall, required − available.
    const noShortfall = {
      error: { code: "insufficient_balance", details: { required_msats: 2_500, available_msats: 1_000 } },
    };
    expect(routstrProblem(readRoutstrError(402, noShortfall))!.topUp).toBe(2);
  });

  it("names the key's node, an expired or invalid key, the upstream, and the settlement", () => {
    expect(routstrProblem(readRoutstrError(401, KEY_NOT_FOUND))).toMatchObject({ kind: "wrong-node" });
    expect(routstrProblem(readRoutstrError(401, { error: { code: "key_expired" } }))).toMatchObject({
      kind: "key-expired",
    });
    const down = routstrProblem(readRoutstrError(424, { error: { code: "UPSTREAM_UNAVAILABLE", message: "x" } }))!;
    expect(down.kind).toBe("upstream-down");
    expect(down.text).toMatch(/Nothing was spent/);
    expect(routstrProblem(readRoutstrError(424, {}))!.kind).toBe("upstream-down");
    expect(routstrProblem(readRoutstrError(429, { error: { code: "UPSTREAM_RATE_LIMIT" } }))!.kind).toBe(
      "rate-limited",
    );
    const settled = routstrProblem(
      readRoutstrError(503, { detail: { error: { code: "payment_settlement_failed", message: "Settlement failed" } } }),
    )!;
    expect(settled).toMatchObject({ kind: "settlement-failed", noResend: true });
    expect(settled.text).toMatch(/isn't sent again/);
  });

  it("leaves other providers' errors alone", () => {
    expect(
      routstrProblem(
        readRoutstrError(401, { error: { message: "Incorrect API key provided", code: "invalid_api_key" } }),
      ),
    ).toBeNull();
    expect(routstrProblem(readRoutstrError(429, { error: { code: "rate_limit_exceeded" } }))).toBeNull();
    expect(routstrProblem(readRoutstrError(503, "Service Unavailable"))).toBeNull();
    expect(routstrProblem(readRoutstrError(402, { error: { message: "Insufficient credits" } }))).toBeNull();
  });
});

describe("an announcement claiming someone else's endpoint (round-2 audit)", () => {
  const REAL = "1".repeat(64);
  const ATTACKER = "2".repeat(64);
  const announce = (pubkey: string, name: string, createdAt: number, u: string[]): NostrEvent => ({
    id: `${pubkey.slice(0, 4)}${createdAt}`.padEnd(64, "0"),
    pubkey,
    created_at: createdAt,
    kind: ROUTSTR_KIND,
    tags: [["d", "node"], ...u.map((x) => ["u", x])],
    content: JSON.stringify({ name, about: "" }),
    sig: "",
  });
  const real = announce(REAL, "Routstr", NOW - 3600, ["https://api.routstr.com"]);
  // Newer, and naming the real node's URL first.
  const fake = announce(ATTACKER, "Routstr Official", NOW - 60, [
    "https://api.routstr.com",
    "https://evil.example.org",
  ]);

  it("doesn't take over the real node's entry: both are listed, marked contested", () => {
    const { fresh } = nodesFrom([real, fake], NOW);
    expect(fresh.map((n) => [n.pubkey, n.name, n.contested])).toEqual([
      [ATTACKER, "Routstr Official", true],
      [REAL, "Routstr", true],
    ]);
  });

  it("once the node's own /v1/info named its key, only that announcer is listed for the URL", () => {
    const { fresh } = nodesFrom([real, fake], NOW, new Map([["https://api.routstr.com", REAL]]));
    expect(fresh.map((n) => [n.pubkey, n.name, !!n.contested])).toEqual([[REAL, "Routstr", false]]);
  });

  it("is never Verified: that comes only from the URL's own /v1/info naming the announcer", () => {
    const info = parseInfo({ ...infoJson, npub: nip19.npubEncode(REAL) });
    expect(isVerified(info, REAL)).toBe(true);
    expect(isVerified(info, ATTACKER)).toBe(false);
    expect(infoOwner(info)).toBe(REAL);
    expect(infoOwner(parseInfo({ ...infoJson, npub: "npub1notreally" }))).toBeNull();
  });
});
