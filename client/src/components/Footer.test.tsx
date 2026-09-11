// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Footer } from "./Footer";

const navigate = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/pricing", (to: string) => navigate(to)] }));
vi.mock("@/hooks/useBillingPlans", () => ({ useBillingPlans: () => ({ billingAvailable: true }) }));
const sub = vi.hoisted(() => ({ isPaid: false, isFree: true }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => ({ isPaid: sub.isPaid, isFree: sub.isFree }) }));

describe("Footer", () => {
  beforeEach(() => {
    navigate.mockClear();
    sub.isPaid = false;
    sub.isFree = true;
  });

  // With payments live, the documents a buyer agrees to belong where people
  // look for them — the footer on Pricing, Settings and every info page. Until
  // now the only links were on /login, which a signed-in reader never sees.
  it("links Privacy and Terms after Roadmap", () => {
    render(<Footer />);
    const labels = Array.from(screen.getByRole("navigation").querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(labels.slice(-3)).toEqual(["Roadmap", "Privacy", "Terms"]);

    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(navigate).toHaveBeenLastCalledWith("/privacy");
    fireEvent.click(screen.getByRole("button", { name: "Terms" }));
    expect(navigate).toHaveBeenLastCalledWith("/terms");
  });

  // Pricing and Roadmap are the pitch, and someone on Priority has already
  // said yes (Benjamin, 2026-09-10) — the same rule that hides the account
  // menu's "Get Priority" row. The documents stay: a subscriber needs them most.
  it("drops Pricing and Roadmap for someone on a paid policy", () => {
    sub.isPaid = true;
    sub.isFree = false;
    render(<Footer />);
    const labels = Array.from(screen.getByRole("navigation").querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Built on Nostr", "What is Web of Trust?", "Privacy", "Terms"]);
  });

  // Reported in review (2026-09-11): a read that's still out or failed is not
  // "no plan", so a subscriber mid-blip isn't pitched either.
  it("holds Pricing and Roadmap back while it doesn't know what they hold", () => {
    sub.isFree = false;
    render(<Footer />);
    const labels = Array.from(screen.getByRole("navigation").querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Built on Nostr", "What is Web of Trust?", "Privacy", "Terms"]);
  });

  it("keeps the workspace footer to the brand and version", () => {
    render(<Footer minimal />);
    expect(screen.queryByRole("button", { name: "Privacy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Terms" })).toBeNull();
  });
});
