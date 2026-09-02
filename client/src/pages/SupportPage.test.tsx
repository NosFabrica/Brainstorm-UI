import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { adminCloseTicket, adminReply, createTicket, fetchSupport, fetchThread } from "@/services/support";
import SupportPage from "./SupportPage";

// Peripheral chrome only — the support seam underneath is the REAL mock store,
// so these tests exercise the same path the browser does.
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: "a".repeat(64), npub: "npub1lira", displayName: "Lira" }),
}));
vi.mock("@/accounts/login-flow", () => ({ logout: vi.fn() }));

describe("SupportPage (through the real mock seam)", () => {
  beforeEach(() => {
    localStorage.clear();
    // The selected ticket syncs to the URL — reset it between tests.
    window.history.replaceState({}, "", "/support");
  });

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
    // The opened date leads the card from its left rail.
    expect(screen.getByTestId(`ticket-date-${t.id}`)).toBeInTheDocument();
    expect(card.textContent).toContain("You");

    await adminReply(t.id, "On it.");
    renderWithProviders(<SupportPage />);
    await waitFor(() => {
      const cards = screen.getAllByTestId(`ticket-${t.id}`);
      expect(cards.at(-1)!.textContent).toContain("Brainstorm Support replied");
    });
  });

  it("a support reply earns a dot; opening the thread clears it", async () => {
    const t = await createTicket({ subject: "Dot check", body: "x", category: "other" });
    await adminReply(t.id, "Here's your answer.");

    renderWithProviders(<SupportPage />);
    await screen.findByTestId(`ticket-unread-${t.id}`);

    // Opening the thread is what "seeing it" means.
    fireEvent.click(screen.getByTestId(`ticket-${t.id}`));
    await screen.findByTestId("support-thread");
    fireEvent.click(screen.getByTestId("thread-back"));

    await screen.findByTestId(`ticket-${t.id}`);
    expect(screen.queryByTestId(`ticket-unread-${t.id}`)).toBeNull();
  });

  // Diagnostics ride along by default — support's first questions, pre-answered
  // — with an opt-out and a disclosure of exactly what's sent.
  it("filing attaches diagnostics unless the user opts out", async () => {
    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId("button-first-ticket"));
    fireEvent.change(screen.getByTestId("ticket-subject"), { target: { value: "With diag" } });
    fireEvent.change(screen.getByTestId("ticket-body"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("category-bug"));
    expect((screen.getByTestId("ticket-include-diagnostics") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId("ticket-submit"));
    await screen.findByTestId("support-thread");

    const withDiag = (await fetchSupport()).tickets.find((t) => t.subject === "With diag")!;
    expect((await fetchThread(withDiag.id)).diagnostics?.Browser).toBeTruthy();

    // Opting out sends nothing.
    fireEvent.click(screen.getByTestId("thread-back"));
    fireEvent.click(screen.getByTestId("button-new-ticket"));
    fireEvent.change(screen.getByTestId("ticket-subject"), { target: { value: "No diag" } });
    fireEvent.change(screen.getByTestId("ticket-body"), { target: { value: "y" } });
    fireEvent.click(screen.getByTestId("category-bug"));
    fireEvent.click(screen.getByTestId("ticket-include-diagnostics"));
    fireEvent.click(screen.getByTestId("ticket-submit"));
    await screen.findByTestId("support-thread");

    const noDiag = (await fetchSupport()).tickets.find((t) => t.subject === "No diag")!;
    expect((await fetchThread(noDiag.id)).diagnostics).toBeNull();
  });

  it("cards lead with the date rail, and sort flips oldest-first", async () => {
    const first = await createTicket({ subject: "First filed", body: "x", category: "other" });
    // Backdate the first ticket so the order is unambiguous.
    const raw = JSON.parse(localStorage.getItem("brainstorm_mock_support")!);
    raw.tickets[0].createdAt = "2026-08-20T09:00:00.000Z";
    raw.tickets[0].lastMessageAt = "2026-08-20T09:00:00.000Z";
    localStorage.setItem("brainstorm_mock_support", JSON.stringify(raw));
    await createTicket({ subject: "Second filed", body: "y", category: "other" });

    renderWithProviders(<SupportPage />);
    await screen.findByTestId("support-ticket-list");

    // Date rail is the card's left edge — dates read first.
    expect(screen.getByTestId(`ticket-date-${first.id}`).textContent).toContain("Aug 20");

    // Default newest-first; the toggle flips to oldest-first.
    let subjects = screen.getAllByTestId(/^ticket-subject-/).map((e) => e.textContent);
    expect(subjects[0]).toBe("Second filed");
    fireEvent.click(screen.getByTestId("sort-toggle"));
    subjects = screen.getAllByTestId(/^ticket-subject-/).map((e) => e.textContent);
    expect(subjects[0]).toBe("First filed");
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

    // The teaser sells the upgrade, not just the FAQ detour.
    const upgrade = screen.getByTestId("teaser-upgrade");
    expect(upgrade).toHaveAttribute("href", "/pricing");
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

  // Refresh-survivable, shareable: the selected ticket lives in the URL.
  it("opens straight into the ticket named by the URL", async () => {
    const t = await createTicket({ subject: "Linked ticket", body: "x", category: "other" });
    window.history.pushState({}, "", `/support?ticket=${t.id}`);

    renderWithProviders(<SupportPage />);

    await screen.findByTestId("support-thread");
    expect(screen.getByText("Linked ticket")).toBeInTheDocument();
    // Back to the list clears the URL param.
    fireEvent.click(screen.getByTestId("thread-back"));
    expect(window.location.search).not.toContain("ticket=");
    window.history.pushState({}, "", "/support");
  });

  it("a user can mark their ticket resolved from the thread", async () => {
    const t = await createTicket({ subject: "Self solve", body: "x", category: "other" });

    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId(`ticket-${t.id}`));

    fireEvent.click(await screen.findByTestId("thread-resolve"));

    await waitFor(() => expect(screen.getByTestId("thread-status").textContent).toBe("closed"));
    expect(screen.getByTestId("ticket-event-closed").textContent).toContain("You marked this resolved");
    // The button is gone; the reopen composer remains.
    expect(screen.queryByTestId("thread-resolve")).toBeNull();
    expect(screen.getByTestId("thread-reply-input")).toBeInTheDocument();
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
