/** The removal dialogs name the Routstr money a removal would delete (round-2 audit). */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ME = "ab".repeat(32);
const accountsFor = vi.fn();
vi.mock("@/accounts/login", async (original) => ({
  ...(await original<typeof import("@/accounts/login")>()),
  accountsFor: (...a: unknown[]) => accountsFor(...a),
}));

import { HeldPurchasesWarning, removalLosesPurchases } from "./HeldPurchasesWarning";
import { putPurchase } from "@/lib/routstrPurchase";

const account = { id: "a", pubkey: ME } as never;

beforeEach(() => {
  localStorage.clear();
  accountsFor.mockReturnValue([account]);
});

const base = {
  node: "https://n.example.org/v1",
  nodeName: null,
  purpose: "create" as const,
  method: "lightning" as const,
  invoiceId: "i",
  bolt11: "lnbc1",
  amountSats: 1,
  expiresAt: 0,
  createdAt: 0,
};

describe("removalLosesPurchases", () => {
  it("names each kind of money held, and not an unpaid invoice", () => {
    expect(removalLosesPurchases(account)).toEqual([]);
    putPurchase(ME, { ...base, id: "unpaid" });
    expect(removalLosesPurchases(account)).toEqual([]);
    putPurchase(ME, { ...base, id: "paid", paidHere: true });
    putPurchase(ME, { ...base, id: "key", key: "sk-x" });
    putPurchase(ME, {
      ...base,
      id: "change",
      method: "cashu",
      paid: true,
      change: { token: "cashuBx", amount: 2, unit: "sat" },
    });
    expect(removalLosesPurchases(account)).toEqual([
      "a paid Lightning invoice whose key hasn't arrived",
      "a bought Routstr key not yet confirmed in your saved keys",
      "Cashu change you haven't put in your wallet",
    ]);
  });

  it("names none while another Account of that identity keeps the rows", () => {
    putPurchase(ME, { ...base, id: "key", key: "sk-x" });
    accountsFor.mockReturnValue([account, { id: "b", pubkey: ME }]);
    expect(removalLosesPurchases(account)).toEqual([]);
  });
});

describe("HeldPurchasesWarning", () => {
  it("says nothing when nothing is held", () => {
    const { container } = render(<HeldPurchasesWarning account={account} />);
    expect(container.textContent).toBe("");
  });

  it("names a key and change the removal would delete", () => {
    putPurchase(ME, {
      id: "c",
      node: "https://n.example.org/v1",
      nodeName: null,
      purpose: "create",
      method: "cashu",
      invoiceId: null,
      bolt11: null,
      amountSats: 1,
      expiresAt: null,
      createdAt: 0,
      paid: true,
      key: "sk-x",
      change: { token: "cashuBx", amount: 1, unit: "sat" },
    });
    render(<HeldPurchasesWarning account={account} />);
    expect(screen.getByTestId("remove-account-held-purchases").textContent).toMatch(
      /a bought Routstr key not yet confirmed in your saved keys and Cashu change you haven't put in your wallet/,
    );
  });
});
