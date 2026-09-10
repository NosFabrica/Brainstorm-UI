// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Footer } from "./Footer";

const navigate = vi.fn();
vi.mock("wouter", () => ({ useLocation: () => ["/pricing", (to: string) => navigate(to)] }));
vi.mock("@/hooks/useBillingPlans", () => ({ useBillingPlans: () => ({ billingAvailable: true }) }));

describe("Footer", () => {
  beforeEach(() => navigate.mockClear());

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

  it("keeps the workspace footer to the brand and version", () => {
    render(<Footer minimal />);
    expect(screen.queryByRole("button", { name: "Privacy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Terms" })).toBeNull();
  });
});
