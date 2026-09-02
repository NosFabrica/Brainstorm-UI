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
    fireEvent.click(screen.getByTestId("ticket-submit"));

    await screen.findByTestId("support-thread");
    expect(screen.getByText("Score stuck")).toBeInTheDocument();
    expect(screen.getByTestId("message-user").textContent).toContain("No movement since Friday.");
    expect(screen.getByTestId("thread-status").textContent).toBe("open");
  });

  it("shows the teaser — and no way to file — when the server says not entitled", async () => {
    localStorage.setItem("brainstorm_mock_support_allowed", "false");
    renderWithProviders(<SupportPage />);

    await screen.findByTestId("support-teaser");
    expect(screen.queryByTestId("button-new-ticket")).toBeNull();
    expect(screen.queryByTestId("button-first-ticket")).toBeNull();
  });

  it("renders a support reply as Brainstorm Support and lets the user answer", async () => {
    const t = await createTicket({ subject: "Alerts", body: "Not receiving alerts." });
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

  it("a closed ticket is read-only with honest copy", async () => {
    const t = await createTicket({ subject: "Old", body: "Solved." });
    await adminCloseTicket(t.id);

    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId(`ticket-${t.id}`));

    await screen.findByTestId("thread-closed-note");
    expect(screen.queryByTestId("thread-reply-input")).toBeNull();
  });

  it("rejects a malformed notification email, accepts an empty one", async () => {
    renderWithProviders(<SupportPage />);
    fireEvent.click(await screen.findByTestId("button-first-ticket"));
    fireEvent.change(screen.getByTestId("ticket-subject"), { target: { value: "Email check" } });
    fireEvent.change(screen.getByTestId("ticket-body"), { target: { value: "Body." } });
    fireEvent.change(screen.getByTestId("ticket-email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByTestId("ticket-submit"));

    await screen.findByTestId("ticket-email-error");
    expect(screen.queryByTestId("support-thread")).toBeNull();

    fireEvent.change(screen.getByTestId("ticket-email"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("ticket-submit"));
    await screen.findByTestId("support-thread");
  });

  it("renders an unknown status neutrally — the set is open", async () => {
    const t = await createTicket({ subject: "Weird", body: "?" });
    const raw = JSON.parse(localStorage.getItem("brainstorm_mock_support")!);
    raw.tickets[0].status = "escalated_to_mars";
    localStorage.setItem("brainstorm_mock_support", JSON.stringify(raw));

    renderWithProviders(<SupportPage />);
    const row = await screen.findByTestId(`ticket-${t.id}`);
    expect(row.textContent).toContain("escalated_to_mars");
  });
});
