/**
 * A Routstr purchase end to end against a mocked node: the record is kept before the
 * invoice is shown, a reload resumes it, a lost invoice id is recovered by the bolt11, a
 * key the node hands over is kept until kind 12000 has it (and kept on when that save
 * fails), an expired invoice is dropped, and Cashu change is handed back. No network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKey } from "@/lib/agentKeys";

const updateAgentKeys = vi.fn();
vi.mock("@/services/agentKeys", () => ({ updateAgentKeys: (...a: unknown[]) => updateAgentKeys(...a) }));
// No relay is asked here.
vi.mock("@/lib/relayRequest", () => ({ requestAll: vi.fn(async () => []) }));

const ME = "ab".repeat(32);
const NODE = "https://routstr.example.org/v1";
const BOLT11 = "lnbc50u1pfakeinvoice";
const KEY = `sk-${"c".repeat(64)}`;
const NOW = Math.floor(Date.now() / 1000);

type Handler = (
  url: string,
  init: RequestInit,
) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
let handle: Handler;
const calls: { url: string; init: RequestInit }[] = [];

function respond(status: number, body: unknown) {
  return { status, body };
}

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  updateAgentKeys.mockReset();
  updateAgentKeys.mockResolvedValue({ success: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const { status, body } = await handle(url, init);
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load() {
  const svc = await import("./routstrPurchase");
  const lib = await import("@/lib/routstrPurchase");
  return { ...svc, ...lib };
}

const invoiceBody = (over: Record<string, unknown> = {}) => ({
  invoice_id: "inv_1",
  bolt11: BOLT11,
  amount_sats: 5000,
  expires_at: NOW + 600,
  payment_hash: "ff",
  ...over,
});
const statusBody = (status: string, apiKey: string | null = null, over: Record<string, unknown> = {}) => ({
  status,
  api_key: apiKey,
  amount_sats: 5000,
  created_at: NOW,
  expires_at: NOW + 600,
  ...over,
});

describe("a Lightning key purchase", () => {
  it("keeps the record before the invoice is returned, then saves the key the node hands over and clears it", async () => {
    handle = (url) => {
      if (url.endsWith("/v2/lightning/invoice")) return respond(200, invoiceBody());
      if (url.endsWith("/v2/lightning/invoice/inv_1/status")) return respond(200, statusBody("pending"));
      return respond(404, {});
    };
    const { startLightningPurchase, pollPurchase, readPurchases } = await load();
    const record = await startLightningPurchase({
      pubkey: ME,
      node: NODE,
      nodeName: "Example",
      amountSats: 5000,
      purpose: "create",
    });
    // On disk before anyone can pay it.
    expect(readPurchases(ME)).toEqual([record]);
    expect(record).toMatchObject({ invoiceId: "inv_1", bolt11: BOLT11, purpose: "create" });
    expect(record.key).toBeUndefined();
    const sent = JSON.parse(calls[0].init.body as string);
    expect(sent).toEqual({ amount_sats: 5000, purpose: "create" });

    expect(await pollPurchase(ME, record.id)).toBe("waiting");
    expect(readPurchases(ME)).toHaveLength(1);

    handle = () => respond(200, statusBody("paid", KEY));
    const seen: string[][] = [];
    updateAgentKeys.mockImplementation(async (change: (k: AgentKey[]) => AgentKey[]) => {
      // While the save is out, the key is already on disk: a closed tab can't lose it.
      seen.push(readPurchases(ME).map((r) => r.key ?? ""));
      expect(change([])).toEqual([{ key: KEY, url: NODE }]);
      return { success: true };
    });
    expect(await pollPurchase(ME, record.id)).toBe("saved");
    expect(seen).toEqual([[KEY]]);
    // Cleared right after the save: the key leaves this device's storage.
    expect(readPurchases(ME)).toEqual([]);
    expect(localStorage.getItem(`routstr:pending:${ME}`)).toBeNull();
  });

  it("resumes after a reload: the record on disk is picked up and polled", async () => {
    handle = (url) =>
      url.endsWith("/v2/lightning/invoice") ? respond(200, invoiceBody()) : respond(200, statusBody("pending"));
    const first = await load();
    const record = await first.startLightningPurchase({
      pubkey: ME,
      node: NODE,
      nodeName: null,
      amountSats: 5000,
      purpose: "create",
    });

    // The tab reloads: every module starts over, only localStorage is left.
    vi.resetModules();
    handle = (url) =>
      url.endsWith(`/invoice/${record.invoiceId}/status`) ? respond(200, statusBody("paid", KEY)) : respond(404, {});
    const second = await load();
    expect(second.readPurchases(ME).map((r) => r.id)).toEqual([record.id]);
    expect(await second.pollPurchase(ME, record.id)).toBe("saved");
    expect(updateAgentKeys).toHaveBeenCalledTimes(1);
    expect(second.readPurchases(ME)).toEqual([]);
  });

  it("recovers the key by the bolt11 when the invoice id is unknown", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, {
      id: "inv_lost",
      node: NODE,
      nodeName: null,
      purpose: "create",
      method: "lightning",
      invoiceId: "inv_lost",
      bolt11: BOLT11,
      amountSats: 5000,
      expiresAt: NOW + 600,
      createdAt: Date.now(),
    });
    handle = (url, init) => {
      if (url.endsWith("/status")) {
        return respond(404, { detail: { error: { code: "invoice_not_found", message: "Invoice not found" } } });
      }
      if (url.endsWith("/v2/lightning/recover")) {
        expect(JSON.parse(init.body as string)).toEqual({ bolt11: BOLT11 });
        return respond(200, statusBody("paid", KEY));
      }
      return respond(500, {});
    };
    expect(await pollPurchase(ME, "inv_lost")).toBe("saved");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/v2/lightning/invoice/inv_lost/status",
      "/v2/lightning/recover",
    ]);
    expect(readPurchases(ME)).toEqual([]);
  });

  it("keeps a paid invoice with no key yet, and keeps recovering: never re-buys", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, {
      id: "inv_1",
      node: NODE,
      nodeName: null,
      purpose: "create",
      method: "lightning",
      invoiceId: "inv_1",
      bolt11: BOLT11,
      amountSats: 5000,
      expiresAt: NOW - 10,
      createdAt: Date.now(),
    });
    handle = () => respond(200, statusBody("paid", null));
    expect(await pollPurchase(ME, "inv_1")).toBe("waiting");
    expect(await pollPurchase(ME, "inv_1")).toBe("waiting");
    expect(readPurchases(ME)[0]).toMatchObject({ paid: true });
    expect(calls.filter((c) => c.url.endsWith("/recover"))).toHaveLength(2);
    // Never a second invoice.
    expect(calls.some((c) => c.url.endsWith("/v2/lightning/invoice"))).toBe(false);
  });

  it("keeps the key pending when saving to kind 12000 fails, and Retry saves it", async () => {
    const { putPurchase, pollPurchase, readPurchases, purchaseState } = await load();
    putPurchase(ME, {
      id: "inv_1",
      node: NODE,
      nodeName: null,
      purpose: "create",
      method: "lightning",
      invoiceId: "inv_1",
      bolt11: BOLT11,
      amountSats: 5000,
      expiresAt: NOW + 600,
      createdAt: Date.now(),
    });
    handle = () => respond(200, statusBody("paid", KEY));
    updateAgentKeys.mockResolvedValueOnce({ success: false, error: "Too few of your relays answered" });
    expect(await pollPurchase(ME, "inv_1")).toBe("unsaved");
    const held = readPurchases(ME)[0];
    expect(held).toMatchObject({ key: KEY, paid: true, saveError: "Too few of your relays answered" });
    expect(purchaseState(held, NOW)).toBe("unsaved-key");

    // Retry: the key in hand is saved, the node isn't asked again.
    calls.length = 0;
    expect(await pollPurchase(ME, "inv_1")).toBe("saved");
    expect(calls).toHaveLength(0);
    expect(readPurchases(ME)).toEqual([]);
  });

  it("a declined or thrown save is kept the same way", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, {
      id: "c1",
      node: NODE,
      nodeName: null,
      purpose: "create",
      method: "cashu",
      invoiceId: null,
      bolt11: null,
      amountSats: 21,
      expiresAt: null,
      createdAt: Date.now(),
      paid: true,
      key: KEY,
    });
    updateAgentKeys.mockRejectedValueOnce(new Error("boom"));
    expect(await pollPurchase(ME, "c1")).toBe("unsaved");
    expect(readPurchases(ME)[0].key).toBe(KEY);
  });

  it("drops an invoice that expired unpaid", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, {
      id: "inv_1",
      node: NODE,
      nodeName: null,
      purpose: "create",
      method: "lightning",
      invoiceId: "inv_1",
      bolt11: BOLT11,
      amountSats: 5000,
      expiresAt: NOW - 60,
      createdAt: Date.now(),
    });
    handle = () => respond(200, statusBody("expired", null, { expires_at: NOW - 60 }));
    expect(await pollPurchase(ME, "inv_1")).toBe("dropped");
    expect(readPurchases(ME)).toEqual([]);
    expect(updateAgentKeys).not.toHaveBeenCalled();
  });

  it("never drops on silence, even past expiry", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, {
      id: "inv_1",
      node: NODE,
      nodeName: null,
      purpose: "create",
      method: "lightning",
      invoiceId: "inv_1",
      bolt11: BOLT11,
      amountSats: 5000,
      expiresAt: NOW - 60,
      createdAt: Date.now(),
    });
    handle = () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await pollPurchase(ME, "inv_1")).toBe("waiting");
    handle = () => respond(502, "error code: 502");
    expect(await pollPurchase(ME, "inv_1")).toBe("waiting");
    expect(readPurchases(ME)).toHaveLength(1);
  });

  it("tops up a saved key: the key goes in Authorization, never in the record", async () => {
    handle = (url, init) => {
      if (url.endsWith("/v2/lightning/invoice")) {
        expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
        expect(JSON.parse(init.body as string)).toEqual({ amount_sats: 1000, purpose: "topup" });
        return respond(200, invoiceBody({ amount_sats: 1000 }));
      }
      return respond(200, statusBody("paid", KEY));
    };
    const { startLightningPurchase, pollPurchase, readPurchases } = await load();
    const record = await startLightningPurchase({
      pubkey: ME,
      node: NODE,
      nodeName: null,
      amountSats: 1000,
      purpose: "topup",
      topUpKey: KEY,
    });
    expect(record.topsUp).toBe("cccc");
    expect(localStorage.getItem(`routstr:pending:${ME}`)).not.toContain(KEY);
    expect(await pollPurchase(ME, record.id)).toBe("topped-up");
    expect(readPurchases(ME)).toEqual([]);
    expect(updateAgentKeys).not.toHaveBeenCalled();
  });

  it("refuses to start when this browser won't keep the record", async () => {
    handle = () => respond(200, invoiceBody());
    const { startLightningPurchase } = await load();
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    try {
      await expect(
        startLightningPurchase({ pubkey: ME, node: NODE, nodeName: null, amountSats: 5000, purpose: "create" }),
      ).rejects.toThrow(/won't keep the purchase/);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});

describe("Cashu", () => {
  const TOKEN = "cashuBo2FteBpodHRwczovL21pbnQuZXhhbXBsZQ";
  const CHANGE = "cashuBchangechangechangechange";

  it("turns a token into a key and saves it; the token itself is never stored", async () => {
    handle = (url, init) => {
      expect(url).toBe("https://routstr.example.org/v1/balance/create");
      expect(JSON.parse(init.body as string)).toEqual({ initial_balance_token: TOKEN });
      return respond(200, { api_key: KEY, balance: 21_000 });
    };
    const { buyWithCashu, readPurchases } = await load();
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      writes.push(v);
      return setItem.call(this, k, v);
    };
    try {
      const result = await buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN });
      expect(result).toEqual({ outcome: "saved", change: null, sats: 21 });
    } finally {
      Storage.prototype.setItem = setItem;
    }
    expect(writes.join()).not.toContain(TOKEN);
    expect(readPurchases(ME)).toEqual([]);
  });

  it("hands the change of a foreign-mint top-up back, and keeps it until the reader took it", async () => {
    handle = (url, init) => {
      expect(url).toBe("https://routstr.example.org/v1/balance/topup");
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(init.body as string)).toEqual({ cashu_token: TOKEN });
      return respond(200, { msats: 19_000, change_token: CHANGE, change_amount: 2, change_unit: "sat" });
    };
    const { topUpWithCashu, readPurchases, changeTaken, purchaseState } = await load();
    const result = await topUpWithCashu({ pubkey: ME, entry: { key: KEY, url: NODE }, token: TOKEN, nodeName: null });
    expect(result).toEqual({ sats: 19, change: { token: CHANGE, amount: 2, unit: "sat" } });
    const [held] = readPurchases(ME);
    expect(held.change).toEqual({ token: CHANGE, amount: 2, unit: "sat" });
    expect(held.key).toBeUndefined();
    expect(purchaseState(held, NOW)).toBe("change");
    changeTaken(ME, held.id);
    expect(readPurchases(ME)).toEqual([]);
  });

  it("a key bought with change keeps the change after the key is saved", async () => {
    handle = () => respond(200, { api_key: KEY, balance: 1_000, change_token: CHANGE, change_amount: 1 });
    const { buyWithCashu, readPurchases } = await load();
    const result = await buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN });
    expect(result.outcome).toBe("saved");
    const [held] = readPurchases(ME);
    expect(held.key).toBeUndefined();
    expect(held.change?.token).toBe(CHANGE);
  });

  it("a node's refusal is said in words, and nothing is kept", async () => {
    handle = () =>
      respond(400, {
        detail: { error: { code: "invalid_cashu_token", message: "Invalid Cashu token", type: "invalid_token" } },
      });
    const { buyWithCashu, readPurchases } = await load();
    await expect(buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN })).rejects.toThrow(
      "Invalid Cashu token",
    );
    expect(readPurchases(ME)).toEqual([]);
  });
});

describe("forgetting", () => {
  it("is refused for anything that may hold money", async () => {
    const { putPurchase, forgetPurchase, readPurchases } = await load();
    const base = {
      node: NODE,
      nodeName: null,
      purpose: "create" as const,
      method: "lightning" as const,
      invoiceId: "x",
      bolt11: BOLT11,
      amountSats: 1,
      expiresAt: NOW - 1,
      createdAt: 0,
    };
    putPurchase(ME, { ...base, id: "paid", paid: true });
    putPurchase(ME, { ...base, id: "key", key: KEY });
    putPurchase(ME, { ...base, id: "here", paidHere: true });
    putPurchase(ME, { ...base, id: "unpaid" });
    expect(forgetPurchase(ME, "paid")).toBe(false);
    expect(forgetPurchase(ME, "key")).toBe(false);
    expect(forgetPurchase(ME, "here")).toBe(false);
    expect(forgetPurchase(ME, "unpaid")).toBe(true);
    expect(readPurchases(ME).map((r) => r.id)).toEqual(["paid", "key", "here"]);
  });
});
