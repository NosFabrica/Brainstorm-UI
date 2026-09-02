import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { adminCloseTicket, adminReply, createTicket } from "@/services/support";
import SupportPage from "./SupportPage";

// Peripheral chrome only — the support seam underneath is the REAL mock store,
// so these tests exercise the same path the browser does.
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));

describe("SupportPage (through the real mock seam)", () => {
  beforeEach(() => localStorage.clear());

  it("files a ticket through the composer and lands in its thread", async () => {
    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId("button-first-ticket"));

    fireEvent.change(screen.getByTestId("ticket-subject"), { target: { value: "Score stuck" } });
    fireEvent.change(screen.getByTestId("ticket-body"), { target: { value: "No movement since Friday." } });
    // Category is REQUIRED — submit stays disabled until a chip is picked.
    expect(screen.getByTestId("ticket-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("category-scores"));
    fireEvent.click(screen.getByTestId("ticket-submit"));

    await screen.findByTestId("support-thread");
    expect(screen.getByText("Score stuck")).toBeInTheDocument();
    expect(screen.getByTestId("message-user").textContent).toContain("No movement since Friday.");
    expect(screen.getByTestId("thread-status").textContent).toBe("open");
  });

  // Deflection: the picked category surfaces FAQ answers BEFORE the ticket is
  // filed — the same hook a knowledge-base/AI answerer plugs into later.
  it("picking a covered category offers FAQ answers first", async () => {
    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId("button-first-ticket"));

    expect(screen.queryByTestId("ticket-deflection")).toBeNull();
    fireEvent.click(screen.getByTestId("category-scores"));
    expect(screen.getByTestId("ticket-deflection").textContent).toContain("GrapeRank");
    // Uncovered categories stay quiet — no fake helpfulness.
    fireEvent.click(screen.getByTestId("category-billing"));
    expect(screen.queryByTestId("ticket-deflection")).toBeNull();
  });

  // The card answers at a glance: what's it about, when opened, who spoke last.
  it("cards carry category, opened date, and who replied last", async () => {
    const t = await createTicket({ subject: "Meta check", body: "hello", category: "billing" });

    renderWithProviders(<SupportPage />);
    let card = await screen.findByTestId(`ticket-${t.id}`);
    expect(card.textContent).toContain("Billing & plan");
    expect(card.textContent).toContain("Opened");
    expect(card.textContent).toContain("You");

    await adminReply(t.id, "On it.");
    renderWithProviders(<SupportPage />);
    await waitFor(() => {
      const cards = screen.getAllByTestId(`ticket-${t.id}`);
      expect(cards.at(-1)!.textContent).toContain("Brainstorm Support replied");
    });
  });

  it("filters the list by status with one tap", async () => {
    await createTicket({ subject: "Open one", body: "x", category: "bug" });
    const closed = await createTicket({ subject: "Closed one", body: "y", category: "other" });
    await adminCloseTicket(closed.id);

    renderWithProviders(<SupportPage />);
    await screen.findByTestId("support-ticket-list");
    expect(screen.getByText("Open one")).toBeInTheDocument();
    expect(screen.getByText("Closed one")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("filter-open"));
    expect(screen.getByText("Open one")).toBeInTheDocument();
    expect(screen.queryByText("Closed one")).toBeNull();

    fireEvent.click(screen.getByTestId("filter-closed"));
    expect(screen.queryByText("Open one")).toBeNull();
    expect(screen.getByText("Closed one")).toBeInTheDocument();
  });

  it("shows the teaser — and no way to file — when the server says not entitled", async () => {
    localStorage.setItem("brainstorm_mock_support_allowed", "false");
    renderWithProviders(<SupportPage />);

    await screen.findByTestId("support-teaser");
    expect(screen.queryByTestId("button-new-ticket")).toBeNull();
    expect(screen.queryByTestId("button-first-ticket")).toBeNull();
  });

  it("renders a support reply as Brainstorm Support and lets the user answer", async () => {
    const t = await createTicket({ subject: "Alerts", body: "Not receiving alerts.", category: "other" });
    await adminReply(t.id, "We found the issue — fix rolling out today.");

    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId(`ticket-${t.id}`));

    const support = await screen.findByTestId("message-support");
    expect(support.textContent).toContain("Brainstorm Support · support@nosfabrica.com");
    expect(support.textContent).toContain("fix rolling out today");

    fireEvent.change(screen.getByTestId("thread-reply-input"), { target: { value: "Confirmed fixed, thanks!" } });
    fireEvent.click(screen.getByTestId("thread-reply-send"));
    await waitFor(() =>
      expect(screen.getAllByTestId("message-user").map((m) => m.textContent).join()).toContain("Confirmed fixed"),
    );
  });

  it("a closed ticket invites reopening — replying flips it back to open", async () => {
    const t = await createTicket({ subject: "Old", body: "Solved.", category: "other" });
    await adminCloseTicket(t.id, "Closing this out.");

    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId(`ticket-${t.id}`));

    await screen.findByTestId("thread-closed-note");
    // The lifecycle is on the record, down to the minute.
    expect(screen.getByTestId("ticket-event-opened").textContent).toContain("Ticket opened");
    const closedLine = screen.getByTestId("ticket-event-closed");
    expect(closedLine.textContent).toContain("Closed by Brainstorm Support");
    expect(closedLine.textContent).toMatch(/\d{1,2}:\d{2}/);

    fireEvent.change(screen.getByTestId("thread-reply-input"), { target: { value: "It came back." } });
    fireEvent.click(screen.getByTestId("thread-reply-send"));

    await waitFor(() => expect(screen.getByTestId("thread-status").textContent).toBe("open"));
    expect(screen.queryByTestId("thread-closed-note")).toBeNull();
    await screen.findByTestId("ticket-event-reopened");
  });

  it("rejects a malformed notification email, accepts an empty one", async () => {
    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId("button-first-ticket"));
    fireEvent.change(screen.getByTestId("ticket-subject"), { target: { value: "Email check" } });
    fireEvent.change(screen.getByTestId("ticket-body"), { target: { value: "Body." } });
    fireEvent.click(screen.getByTestId("category-other"));
    fireEvent.change(screen.getByTestId("ticket-email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByTestId("ticket-submit"));

    await screen.findByTestId("ticket-email-error");
    expect(screen.queryByTestId("support-thread")).toBeNull();

    fireEvent.change(screen.getByTestId("ticket-email"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("ticket-submit"));
    await screen.findByTestId("support-thread");
  });

  it("renders an unknown status neutrally — the set is open", async () => {
    const t = await createTicket({ subject: "Weird", body: "?", category: "other" });
    const raw = JSON.parse(localStorage.getItem("brainstorm_mock_support")!);
    raw.tickets[0].status = "escalated_to_mars";
    localStorage.setItem("brainstorm_mock_support", JSON.stringify(raw));

    renderWithProviders(<SupportPage />);
    const row = await screen.findByTestId(`ticket-${t.id}`);
    expect(row.textContent).toContain("escalated_to_mars");
  });
});
