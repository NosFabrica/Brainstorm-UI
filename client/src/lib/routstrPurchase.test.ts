/**
 * The purchase machine's rules, one node answer at a time: a paid purchase is never
 * dropped, a paid `create` with no key keeps recovering, an invoice goes only when it
 * expired unpaid, and silence moves nothing.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  SETTLEMENT_GRACE_SECONDS,
  advance,
  purchaseState,
  putPurchase,
  readPurchases,
  removePurchase,
  updatePurchase,
  letGo,
  writePurchases,
  type PendingPurchase,
} from "./routstrPurchase";

const NOW = 1_794_528_000;
const ME = "ab".repeat(32);

const invoice = (over: Partial<PendingPurchase> = {}): PendingPurchase => ({
  id: "inv_1",
  node: "https://routstr.example.org/v1",
  nodeName: "Example",
  purpose: "create",
  method: "lightning",
  invoiceId: "inv_1",
  bolt11: "lnbc50u1fake",
  amountSats: 5000,
  expiresAt: NOW + 600,
  createdAt: NOW * 1000,
  ...over,
});

const status = (s: string, apiKey: string | null = null) => ({ type: "status" as const, status: s, apiKey });

describe("advance", () => {
  it("waits while the invoice is pending, and through silence", () => {
    expect(advance(invoice(), status("pending"), NOW).next).toBe("wait");
    expect(advance(invoice(), status("settlement_pending"), NOW).next).toBe("wait");
    expect(advance(invoice({ expiresAt: NOW - 10_000 }), { type: "unreachable" }, NOW).next).toBe("wait");
  });

  it("saves a create's key the moment it arrives, holding it in the record", () => {
    const step = advance(invoice(), status("paid", "sk-bought"), NOW);
    expect(step.next).toBe("save");
    expect(step.record).toMatchObject({ paid: true, key: "sk-bought" });
  });

  it("recovers by the bolt11 when paid without a key, and never drops it", () => {
    const paid = advance(invoice(), status("paid"), NOW);
    expect(paid.next).toBe("recover");
    expect(paid.record.paid).toBe(true);
    // Recover answered paid with no key either: wait for the next turn, keep the record.
    expect(advance(paid.record, status("paid"), NOW, "recover").next).toBe("wait");
    // Long past expiry, whatever the node says, a paid one stays.
    const late = NOW + SETTLEMENT_GRACE_SECONDS * 3;
    expect(advance(paid.record, status("expired"), late).next).toBe("wait");
    expect(advance(paid.record, { type: "not-found" }, late, "recover").next).toBe("wait");
  });

  it("recovers by the bolt11 when the node no longer knows the invoice id", () => {
    expect(advance(invoice(), { type: "not-found" }, NOW).next).toBe("recover");
    // Recover doesn't know it either, before expiry: wait.
    expect(advance(invoice(), { type: "not-found" }, NOW, "recover").next).toBe("wait");
  });

  it("keeps an invoice the node calls expired for the day it may still settle, then recovers once and drops it", () => {
    // Paid near expiry from another wallet: the node still moves it to paid for a day.
    const expired = invoice({ expiresAt: NOW - 5 });
    expect(advance(expired, status("expired"), NOW).next).toBe("wait");
    expect(advance(expired, { type: "not-found" }, NOW, "recover").next).toBe("wait");
    expect(advance(invoice(), status("expired"), NOW).next).toBe("wait");
    // Past the grace: the bolt11 is asked once, and only then is it dropped.
    const late = NOW + SETTLEMENT_GRACE_SECONDS;
    const asked = advance(expired, status("expired"), late);
    expect(asked).toMatchObject({ next: "recover", record: { recoverTried: true } });
    expect(advance(asked.record, status("expired"), late, "recover").next).toBe("drop");
    expect(advance(asked.record, status("expired"), late).next).toBe("drop");
    // A node that never moves a dead invoice on: the same, once it can't be settled any more.
    expect(advance(expired, status("pending"), NOW).next).toBe("wait");
    expect(advance(expired, status("pending"), late).next).toBe("recover");
    expect(advance(asked.record, status("pending"), late, "recover").next).toBe("drop");
  });

  it("never drops an invoice this device tried to pay: it ends, and the reader decides", () => {
    const tried = invoice({ expiresAt: NOW - 5, payAttempted: true, recoverTried: true });
    expect(advance(tried, status("expired"), NOW).next).toBe("wait");
    const late = advance(tried, status("expired"), NOW + SETTLEMENT_GRACE_SECONDS);
    expect(late).toMatchObject({ next: "wait", record: { ended: true } });
  });

  it("keeps an expired invoice this device's wallet paid: the node settles for a day past expiry", () => {
    const paidHere = invoice({ expiresAt: NOW - 1, paidHere: true });
    expect(advance(paidHere, status("expired"), NOW).next).toBe("wait");
    expect(advance(paidHere, status("paid", "sk-late"), NOW).next).toBe("save");
  });

  it("finishes a paid top-up with nothing kept", () => {
    const topup = invoice({ purpose: "topup", topsUp: "a1b2" });
    const step = advance(topup, status("paid", "sk-the-same-key"), NOW);
    expect(step.next).toBe("done");
    // A top-up never takes the key into its record.
    expect(step.record.key).toBeUndefined();
  });

  it("waits while the node reconciles a payment it didn't see settle", () => {
    const step = advance(invoice(), status("reconciliation_required"), NOW);
    expect(step).toMatchObject({ next: "wait", record: { reconciling: true } });
    expect(purchaseState(step.record, NOW)).toBe("reconciling");
  });
});

describe("purchaseState", () => {
  it("says what the reader is shown", () => {
    expect(purchaseState(invoice(), NOW)).toBe("awaiting-payment");
    expect(purchaseState(invoice({ paidHere: true }), NOW)).toBe("confirming");
    expect(purchaseState(invoice({ expiresAt: NOW - 1 }), NOW)).toBe("expired");
    expect(purchaseState(invoice({ key: "sk-x", saveError: "no" }), NOW)).toBe("unsaved-key");
    expect(
      purchaseState(
        invoice({ method: "cashu", bolt11: null, change: { token: "cashuBxxxxxxxxxx", amount: 1, unit: "sat" } }),
        NOW,
      ),
    ).toBe("change");
  });
});

describe("storage", () => {
  beforeEach(() => localStorage.clear());

  it("is per account, survives a reload (a fresh read), and clears to nothing", () => {
    expect(readPurchases(ME)).toEqual([]);
    expect(putPurchase(ME, invoice())).toBe(true);
    expect(localStorage.getItem(`routstr:pending:${ME}`)).toContain("lnbc50u1fake");
    expect(readPurchases("cd".repeat(32))).toEqual([]);
    expect(readPurchases(ME)).toEqual([invoice()]);
    // Another tab's write is read fresh.
    localStorage.setItem(`routstr:pending:${ME}`, JSON.stringify([invoice({ id: "other" })]));
    expect(readPurchases(ME).map((r) => r.id)).toEqual(["other"]);
    expect(removePurchase(ME, "other")).toBe(true);
    expect(localStorage.getItem(`routstr:pending:${ME}`)).toBeNull();
  });

  it("returns the same list while nothing changed, and ignores garbage", () => {
    putPurchase(ME, invoice());
    expect(readPurchases(ME)).toBe(readPurchases(ME));
    localStorage.setItem(`routstr:pending:${ME}`, "{not json");
    expect(readPurchases(ME)).toEqual([]);
    localStorage.setItem(`routstr:pending:${ME}`, JSON.stringify([{ id: 1 }, invoice()]));
    expect(readPurchases(ME)).toHaveLength(1);
  });

  it("says when storage refused a write", () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    try {
      expect(writePurchases(ME, [invoice()])).toBe(false);
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
});

describe("updatePurchase never brings back a secret that was let go (audit, 2026-11-20)", () => {
  beforeEach(() => localStorage.clear());
  const CHANGE = { token: "cashuBchangechangechange", amount: 1, unit: "sat" };

  it("a change taken stays taken, a key confirmed stays gone, whatever a turn read before", () => {
    const held = invoice({ paid: true, key: "sk-x", change: CHANGE });
    putPurchase(ME, held);
    // A turn read the record (key and change) and is out.
    const stale = readPurchases(ME)[0];
    // The reader took the change; kind 12000 was read back and the key let go.
    putPurchase(ME, letGo(letGo(stale, "change"), "key"));
    expect(updatePurchase(ME, { ...stale, reconciling: false })).toBe(true);
    const now = readPurchases(ME)[0];
    expect(now.change).toBeUndefined();
    expect(now.key).toBeUndefined();
  });

  it("a key the node hands over is still added", () => {
    putPurchase(ME, invoice({ paid: true }));
    expect(updatePurchase(ME, { ...readPurchases(ME)[0], key: "sk-new" })).toBe(true);
    expect(readPurchases(ME)[0].key).toBe("sk-new");
  });
});

describe("readRefund", () => {
  it("reads a refund's token and amount, sats or msats, as numbers or strings", async () => {
    const { readRefund } = await import("./routstr");
    expect(readRefund({ token: "cashuBrefundrefundrefund", sats: "21" })).toEqual({
      token: "cashuBrefundrefundrefund",
      amount: 21,
      unit: "sat",
    });
    expect(readRefund({ token: "cashuBrefundrefundrefund", msats: 21_900 })?.amount).toBe(21);
    expect(readRefund({ sats: 21 })).toBeNull();
  });
});
