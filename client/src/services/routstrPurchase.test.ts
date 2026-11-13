/**
 * A Routstr purchase end to end against a mocked node: the record is kept before the
 * invoice is shown, a reload resumes it, a lost invoice id is recovered by the bolt11, a
 * key the node hands over is kept until kind 12000 has it (and kept on when that save
 * fails), an expired invoice is dropped, and Cashu change is handed back. No network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentKey } from "@/lib/agentKeys";

const updateAgentKeys = vi.fn();
const agentKeysHold = vi.fn();
vi.mock("@/services/agentKeys", () => ({
  updateAgentKeys: (...a: unknown[]) => updateAgentKeys(...a),
  agentKeysHold: (...a: unknown[]) => agentKeysHold(...a),
}));
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
  agentKeysHold.mockReset();
  agentKeysHold.mockResolvedValue(true);
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
    // Kept until a read of kind 12000 shows it, then cleared: the key leaves this device's storage.
    expect(readPurchases(ME)[0]).toMatchObject({ key: KEY, savedAt: expect.any(Number) });
    expect(await pollPurchase(ME, record.id)).toBe("confirmed");
    expect(agentKeysHold).toHaveBeenCalledWith(ME, { key: KEY, url: NODE });
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
    expect(await second.pollPurchase(ME, record.id)).toBe("confirmed");
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
    expect(await pollPurchase(ME, "inv_lost")).toBe("confirmed");
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
    expect(await pollPurchase(ME, "inv_1")).toBe("confirmed");
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
    const { buyWithCashu, pollPurchase, readPurchases } = await load();
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      writes.push(v);
      return setItem.call(this, k, v);
    };
    try {
      const result = await buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN });
      expect(result).toEqual({ outcome: "saved", change: null, sats: 21, id: expect.any(String) });
      expect(await pollPurchase(ME, result.id)).toBe("confirmed");
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
    expect(result).toEqual({ sats: 19, change: { token: CHANGE, amount: 2, unit: "sat" }, id: expect.any(String) });
    const [held] = readPurchases(ME);
    expect(held.id).toBe(result.id);
    expect(held.change).toEqual({ token: CHANGE, amount: 2, unit: "sat" });
    expect(held.key).toBeUndefined();
    expect(purchaseState(held, NOW)).toBe("change");
    changeTaken(ME, held.id);
    expect(readPurchases(ME)).toEqual([]);
  });

  it("a key bought with change keeps the change after the key is saved", async () => {
    handle = () => respond(200, { api_key: KEY, balance: 1_000, change_token: CHANGE, change_amount: 1 });
    const { buyWithCashu, pollPurchase, readPurchases } = await load();
    const result = await buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN });
    expect(result.outcome).toBe("saved");
    expect(await pollPurchase(ME, result.id)).toBe("confirmed");
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

describe("round-2 audit (2026-11-13)", () => {
  const base = {
    node: NODE,
    nodeName: null,
    purpose: "create" as const,
    method: "lightning" as const,
    bolt11: BOLT11,
    amountSats: 5000,
    createdAt: 0,
  };
  const deps = (over: Partial<import("./routstrPurchase").PurchaseDeps> = {}) => ({
    status: async () => ({ type: "status", status: "pending", apiKey: null }) as const,
    recover: async () => ({ type: "not-found" }) as const,
    saveKey: async () => ({ ok: true }) as const,
    keyHeld: async () => true,
    keyLive: async () => "unknown" as const,
    now: () => NOW,
    ...over,
  });

  it("a saved key whose write another one undid is saved again; the record stays until a read shows it", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, { ...base, id: "k", invoiceId: "k", expiresAt: NOW + 600, paid: true, key: KEY });
    const saveKey = vi.fn(async () => ({ ok: true }) as const);
    const keyHeld = vi.fn<() => Promise<boolean | null>>();
    const d = deps({ saveKey, keyHeld });
    expect(await pollPurchase(ME, "k", d)).toBe("saved");
    // An edit elsewhere replaced the event: the key isn't in it.
    keyHeld.mockResolvedValueOnce(false);
    expect(await pollPurchase(ME, "k", d)).toBe("waiting");
    expect(readPurchases(ME)[0]).toMatchObject({ key: KEY });
    expect(readPurchases(ME)[0].savedAt).toBeUndefined();
    expect(await pollPurchase(ME, "k", d)).toBe("saved");
    expect(saveKey).toHaveBeenCalledTimes(2);
    // Relays didn't answer: nothing is let go.
    keyHeld.mockResolvedValueOnce(null);
    expect(await pollPurchase(ME, "k", d)).toBe("waiting");
    expect(readPurchases(ME)).toHaveLength(1);
    keyHeld.mockResolvedValueOnce(true);
    expect(await pollPurchase(ME, "k", d)).toBe("confirmed");
    expect(readPurchases(ME)).toEqual([]);
  });

  it("a bought key is saved as the account it was bought for, and waits untouched while another is active", async () => {
    const { putPurchase, pollPurchase, readPurchases } = await load();
    putPurchase(ME, { ...base, id: "k", invoiceId: "k", expiresAt: NOW + 600, paid: true, key: KEY });
    updateAgentKeys.mockResolvedValueOnce({ success: false, error: "switched", notActive: true });
    expect(await pollPurchase(ME, "k")).toBe("waiting");
    expect(updateAgentKeys.mock.calls[0][1]).toEqual({ pubkey: ME });
    const held = readPurchases(ME)[0];
    expect(held.saveError).toBeUndefined();
    expect(held.savedAt).toBeUndefined();
    expect(held.key).toBe(KEY);
  });

  it("a poll out while the wallet pays doesn't erase paidHere, so a later `expired` can't drop the paid invoice", async () => {
    const { putPurchase, pollPurchase, readPurchases, markPaidHere } = await load();
    putPurchase(ME, { ...base, id: "inv", invoiceId: "inv", expiresAt: NOW + 10 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = pollPurchase(
      ME,
      "inv",
      deps({
        status: async () => {
          await gate;
          return { type: "status", status: "pending", apiKey: null } as const;
        },
      }),
    );
    markPaidHere(ME, "inv");
    release();
    expect(await p).toBe("waiting");
    expect(readPurchases(ME)[0].paidHere).toBe(true);
    const expired = deps({
      status: async () => ({ type: "status", status: "expired", apiKey: null }) as const,
      now: () => NOW + 11,
    });
    expect(await pollPurchase(ME, "inv", expired)).toBe("waiting");
    expect(readPurchases(ME)[0]).toMatchObject({ bolt11: BOLT11, paidHere: true });
  });

  it("a poll never brings back a record that went while it was out", async () => {
    const { putPurchase, pollPurchase, readPurchases, removePurchase } = await load();
    putPurchase(ME, { ...base, id: "inv", invoiceId: "inv", expiresAt: NOW + 600 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = pollPurchase(
      ME,
      "inv",
      deps({
        status: async () => {
          await gate;
          return { type: "status", status: "pending", apiKey: null } as const;
        },
      }),
    );
    removePurchase(ME, "inv");
    release();
    expect(await p).toBe("gone");
    expect(readPurchases(ME)).toEqual([]);
  });

  it("a paid-here invoice the node calls expired a day past expiry: recover once, then it has ended and may be forgotten", async () => {
    const { putPurchase, pollPurchase, readPurchases, forgetPurchase, purchaseState } = await load();
    putPurchase(ME, { ...base, id: "inv", invoiceId: "inv", expiresAt: NOW - 90_000, paidHere: true });
    expect(forgetPurchase(ME, "inv")).toBe(false);
    const recover = vi.fn(async () => ({ type: "not-found" }) as const);
    const d = deps({ status: async () => ({ type: "status", status: "expired", apiKey: null }) as const, recover });
    expect(await pollPurchase(ME, "inv", d)).toBe("waiting");
    expect(recover).toHaveBeenCalledTimes(1);
    const held = readPurchases(ME)[0];
    expect(held).toMatchObject({ ended: true, recoverTried: true, paidHere: true });
    expect(purchaseState(held, NOW)).toBe("ended");
    // Ended: nothing more is asked.
    expect(await pollPurchase(ME, "inv", d)).toBe("waiting");
    expect(recover).toHaveBeenCalledTimes(1);
    expect(forgetPurchase(ME, "inv")).toBe(true);
  });

  it("a paid-here invoice that recover finds past the grace still saves its key", async () => {
    const { putPurchase, pollPurchase } = await load();
    putPurchase(ME, { ...base, id: "inv", invoiceId: "inv", expiresAt: NOW - 90_000, paidHere: true });
    const d = deps({
      status: async () => ({ type: "status", status: "expired", apiKey: null }) as const,
      recover: async () => ({ type: "status", status: "paid", apiKey: KEY }) as const,
    });
    expect(await pollPurchase(ME, "inv", d)).toBe("saved");
  });

  describe("a Cashu key", () => {
    const TOKEN = "cashuBo2FteBpodHRwczovL21pbnQuZXhhbXBsZQ";

    it("is kept, as sk- + sha256(token), before the token is sent", async () => {
      const { buyWithCashu, cashuKey, readPurchases } = await load();
      const expected = await cashuKey(TOKEN);
      expect(expected).toMatch(/^sk-[0-9a-f]{64}$/);
      handle = () => {
        // On disk while the token is out.
        expect(readPurchases(ME)).toEqual([expect.objectContaining({ key: expected, unconfirmed: true })]);
        return respond(200, { api_key: expected, balance: 21_000 });
      };
      expect((await buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN })).outcome).toBe("saved");
      expect(readPurchases(ME)[0]).toMatchObject({ key: expected, paid: true });
      expect(readPurchases(ME)[0].unconfirmed).toBeUndefined();
    });

    it("isn't sent when this browser won't keep its key", async () => {
      handle = () => respond(200, { api_key: KEY });
      const { buyWithCashu } = await load();
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error("QuotaExceeded");
      };
      try {
        await expect(buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN })).rejects.toThrow(
          /won't keep the purchase/,
        );
      } finally {
        Storage.prototype.setItem = setItem;
      }
      expect(calls).toHaveLength(0);
    });

    it("after silence, the poller asks whether the key exists: live is saved, missing (later) is let go", async () => {
      handle = () => {
        throw new TypeError("Failed to fetch");
      };
      const { buyWithCashu, pollPurchase, readPurchases, putPurchase } = await load();
      await expect(buyWithCashu({ pubkey: ME, node: NODE, nodeName: null, token: TOKEN })).rejects.toThrow();
      const [held] = readPurchases(ME);
      expect(held).toMatchObject({ unconfirmed: true });
      expect(updateAgentKeys).not.toHaveBeenCalled();
      // Too soon to tell: "no such key" waits.
      expect(await pollPurchase(ME, held.id, deps({ keyLive: async () => "missing" }))).toBe("waiting");
      expect(readPurchases(ME)).toHaveLength(1);
      // The node did take it.
      expect(await pollPurchase(ME, held.id, deps({ keyLive: async () => "live" }))).toBe("waiting");
      expect(readPurchases(ME)[0]).toMatchObject({ paid: true, key: held.key });
      expect(await pollPurchase(ME, held.id, deps())).toBe("saved");
      // One the node never took, long after: let go (the reader still holds the token).
      putPurchase(ME, { ...held, id: "old", createdAt: Date.now() - 3_600_000 });
      expect(await pollPurchase(ME, "old", deps({ keyLive: async () => "missing" }))).toBe("dropped");
    });
  });
});

describe("the poller (round-2 audit)", () => {
  const rec = (id: string) => ({
    id,
    node: "https://n.example/v1",
    nodeName: null,
    purpose: "create" as const,
    method: "lightning" as const,
    invoiceId: id,
    bolt11: "lnbc1" + id,
    amountSats: 1000,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    createdAt: 0,
  });

  it("a record going while another's status call is out doesn't stop the other's polling", async () => {
    vi.useFakeTimers();
    try {
      const { renderHook, act } = await import("@testing-library/react");
      let gateA = false;
      let release: (() => void) | null = null;
      handle = async (url) => {
        if (url.includes("/a/") && gateA && !release) await new Promise<void>((r) => (release = r));
        return respond(200, statusBody("pending"));
      };
      const { usePurchasePoller, putPurchase, removePurchase } = await load();
      putPurchase(ME, rec("a"));
      putPurchase(ME, rec("b"));
      renderHook(() => usePurchasePoller(ME));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      gateA = true;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(release).not.toBeNull();
      await act(async () => {
        removePurchase(ME, "b");
      });
      await act(async () => {
        release!();
        await vi.advanceTimersByTimeAsync(0);
      });
      const asks = () => calls.filter((c) => c.url.includes("/a/")).length;
      const before = asks();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(asks() - before).toBeGreaterThan(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a new record doesn't make every idle one ask again at once", async () => {
    vi.useFakeTimers();
    try {
      const { renderHook, act } = await import("@testing-library/react");
      handle = () => respond(200, statusBody("pending"));
      const { usePurchasePoller, putPurchase } = await load();
      putPurchase(ME, rec("a"));
      renderHook(() => usePurchasePoller(ME));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      const asks = () => calls.filter((c) => c.url.includes("/a/")).length;
      expect(asks()).toBe(1);
      await act(async () => {
        putPurchase(ME, rec("b"));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      // b asked at once, a still on its own three seconds.
      expect(calls.filter((c) => c.url.includes("/b/"))).toHaveLength(1);
      expect(asks()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing, and marks nothing, for an account signed out while its turn was out", async () => {
    vi.useFakeTimers();
    try {
      const { renderHook, act } = await import("@testing-library/react");
      let release!: () => void;
      updateAgentKeys.mockImplementation(
        () => new Promise((r) => (release = () => r({ success: false, error: "Not logged in", notActive: true }))),
      );
      const { usePurchasePoller, putPurchase, readPurchases } = await load();
      putPurchase(ME, { ...rec("k"), paid: true, key: KEY });
      const onOutcome = vi.fn();
      const { rerender } = renderHook(({ pk }) => usePurchasePoller(pk, onOutcome), {
        initialProps: { pk: ME as string | null },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      rerender({ pk: null });
      await act(async () => {
        release();
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(onOutcome).not.toHaveBeenCalled();
      expect(readPurchases(ME)[0].saveError).toBeUndefined();
      expect(updateAgentKeys).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
