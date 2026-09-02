import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { createTicket, fetchThread } from "@/services/support";
import { AdminSupportCards } from "./AdminSupportCards";

describe("AdminSupportCards (same mock store as the user page)", () => {
  beforeEach(() => localStorage.clear());

  it("lists tickets, replies as support, and closes — the full loop", async () => {
    const t = await createTicket({ subject: "Alerts broken", body: "No alerts since Friday." });

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
});
