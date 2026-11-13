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

  it("drops an invoice that expired unpaid", () => {
    const expired = invoice({ expiresAt: NOW - 1 });
    expect(advance(expired, status("expired"), NOW).next).toBe("drop");
    // The node said expired before its own clock passed ours: still not before our expiry.
    expect(advance(invoice(), status("expired"), NOW).next).toBe("wait");
    // A node that never moves a dead invoice on: dropped once it can't be settled any more.
    expect(advance(expired, status("pending"), NOW).next).toBe("wait");
    expect(advance(expired, status("pending"), NOW + SETTLEMENT_GRACE_SECONDS + 1).next).toBe("drop");
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
