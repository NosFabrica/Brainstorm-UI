import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { createTicket, fetchThread } from "@/services/support";
import { AdminSupportCards } from "./AdminSupportCards";

describe("AdminSupportCards (same mock store as the user page)", () => {
  beforeEach(() => localStorage.clear());

  it("lists tickets, replies as support, and closes — the full loop", async () => {
    const t = await createTicket({ subject: "Alerts broken", body: "No alerts since Friday.", category: "other" });

    renderWithProviders(<AdminSupportCards active />);
    fireEvent.click(await screen.findByTestId(`admin-ticket-${t.id}`));

    // The user's message is in the thread.
    const userMsg = await screen.findByTestId("admin-message-user");
    expect(userMsg.textContent).toContain("No alerts since Friday.");

    // Reply as support → status answered, and the reply lands in the shared store.
    fireEvent.change(screen.getByTestId("admin-reply-input"), { target: { value: "Fix ships today." } });
    fireEvent.click(screen.getByTestId("admin-reply-send"));
    await waitFor(() => expect(screen.getByTestId("admin-thread-status").textContent).toBe("answered"));
    const afterReply = await fetchThread(t.id);
    expect(afterReply.messages.at(-1)).toMatchObject({ author: "support", body: "Fix ships today." });

    // Close → read-only.
    fireEvent.click(screen.getByTestId("admin-close-ticket"));
    await screen.findByTestId("admin-thread-closed");
    expect((await fetchThread(t.id)).ticket.status).toBe("closed");
    expect(screen.queryByTestId("admin-reply-input")).toBeNull();
  });

  it("says so plainly when there are no tickets", async () => {
    renderWithProviders(<AdminSupportCards active />);
    await screen.findByTestId("admin-support-empty");
  });

  it("works the queue: open tickets first by default, search narrows, category shows its label", async () => {
    const a = await createTicket({ subject: "Billing question", body: "x", category: "billing" });
    const b = await createTicket({ subject: "Score question", body: "y", category: "scores" });
    const { adminCloseTicket } = await import("@/services/support");
    await adminCloseTicket(a.id);

    renderWithProviders(<AdminSupportCards active />);
    await screen.findByTestId("table-admin-support");

    // Default sort: the open ticket outranks the (newer-activity) closed one.
    const rows = screen.getAllByTestId(/^admin-ticket-/);
    expect(rows[0].textContent).toContain("Score question");
    expect(rows[0].textContent).toContain("Scores & calculation");

    fireEvent.change(screen.getByTestId("input-support-search"), { target: { value: "billing" } });
    expect(screen.queryByTestId(`admin-ticket-${b.id}`)).toBeNull();
    expect(screen.getByTestId(`admin-ticket-${a.id}`)).toBeInTheDocument();
    expect(screen.getByTestId("support-filter-count").textContent).toBe("1 of 2");
  });
});
