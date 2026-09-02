import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { createTicket, fetchThread } from "@/services/support";
import { AdminSupportCards } from "./AdminSupportCards";

// Kind-0 enrichment, same seam the other admin surfaces use.
const fetchProfileMap = vi.fn(async (_pubkeys: string[]) => new Map<string, { name?: string; display_name?: string; picture?: string }>());
vi.mock("@/services/nostr", () => ({
  fetchProfileMap: (pubkeys: string[]) => fetchProfileMap(pubkeys),
}));

const PK = "c".repeat(64);

/** The store shape the real server produces: a ticket attributed to a pubkey. */
function seedTicketWithPubkey(subject: string, pubkey: string, lastMessageAt = new Date().toISOString()) {
  const raw = JSON.parse(localStorage.getItem("brainstorm_mock_support") ?? '{"tickets":[]}');
  const id = `tkt_seed_${raw.tickets.length}`;
  raw.tickets.push({
    id, subject, category: "scores", status: "open",
    createdAt: lastMessageAt, lastMessageAt, pubkey,
    messages: [{ id: `${id}_m`, author: "user", body: "seeded", createdAt: lastMessageAt }],
  });
  localStorage.setItem("brainstorm_mock_support", JSON.stringify(raw));
  return id;
}

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

    // Close asks first, with an editable queued message — sent on the press.
    fireEvent.click(screen.getByTestId("admin-close-ticket"));
    const dialog = await screen.findByTestId("close-ticket-dialog");
    expect((screen.getByTestId("close-message-input") as HTMLTextAreaElement).value).toContain("reply here and it reopens");
    fireEvent.click(screen.getByTestId("close-send"));

    await screen.findByTestId("admin-thread-closed");
    const closedThread = await fetchThread(t.id);
    expect(closedThread.ticket.status).toBe("closed");
    expect(closedThread.messages.at(-1)!.body).toContain("reply here and it reopens");
    expect(screen.queryByTestId("admin-reply-input")).toBeNull();
    void dialog;
  });

  it("shows who the requester IS — avatar name over npub, not a hex string", async () => {
    const id = seedTicketWithPubkey("Named user ticket", PK);
    fetchProfileMap.mockResolvedValue(new Map([[PK, { display_name: "Dr Martha Liz", picture: "https://x/p.jpg" }]]));

    renderWithProviders(<AdminSupportCards active />);
    const row = await screen.findByTestId(`admin-ticket-${id}`);
    await waitFor(() => expect(row.textContent).toContain("Dr Martha Liz"));
    expect(row.textContent).toContain("npub1");
  });

  it("filters to one user's tickets — by profile-name search, or by clicking the requester", async () => {
    const martha = "d".repeat(64);
    const other = "e".repeat(64);
    const m1 = seedTicketWithPubkey("Martha first", martha);
    const m2 = seedTicketWithPubkey("Martha second", martha);
    const o1 = seedTicketWithPubkey("Someone else", other);
    fetchProfileMap.mockResolvedValue(new Map([[martha, { display_name: "Dr Martha Liz" }]]));

    renderWithProviders(<AdminSupportCards active />);
    const row = await screen.findByTestId(`admin-ticket-${m1}`);
    await waitFor(() => expect(row.textContent).toContain("Dr Martha Liz"));

    // Search knows who people are, not just their npubs.
    fireEvent.change(screen.getByTestId("input-support-search"), { target: { value: "martha liz" } });
    expect(screen.getByTestId(`admin-ticket-${m1}`)).toBeInTheDocument();
    expect(screen.getByTestId(`admin-ticket-${m2}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`admin-ticket-${o1}`)).toBeNull();

    // Clicking a requester is the one-tap "all their tickets" view.
    fireEvent.change(screen.getByTestId("input-support-search"), { target: { value: "" } });
    await screen.findByTestId(`admin-ticket-${o1}`);
    fireEvent.click(screen.getAllByTestId(`requester-${martha.slice(0, 8)}`)[0]);
    expect(screen.getByTestId(`admin-ticket-${m1}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`admin-ticket-${o1}`)).toBeNull();
    expect(screen.getByTestId("support-filter-count").textContent).toBe("2 of 3");
  });

  it("narrows to a time frame — stale tickets drop out of the 24h view", async () => {
    seedTicketWithPubkey("Ancient issue", PK, new Date(Date.now() - 10 * 86_400_000).toISOString());
    seedTicketWithPubkey("Fresh issue", PK);
    const { adminListTickets } = await import("@/services/support");
    const { filterAndSort } = await import("./AdminSupportCards");
    const tickets = await adminListTickets();

    const dayView = filterAndSort(tickets, new Map(), "", "all", "all", "24h", null);
    expect(dayView.map((t) => t.subject)).toEqual(["Fresh issue"]);
    const allView = filterAndSort(tickets, new Map(), "", "all", "all", "all", null);
    expect(allView).toHaveLength(2);
  });

  it("a waiting user earns the admin a dot; opening the thread clears it", async () => {
    const t = await createTicket({ subject: "Waiting", body: "hello?", category: "other" });

    renderWithProviders(<AdminSupportCards active />);
    await screen.findByTestId(`admin-unread-${t.id}`);

    fireEvent.click(screen.getByTestId(`admin-ticket-${t.id}`));
    await screen.findByTestId("admin-support-thread");
    fireEvent.click(screen.getByTestId("admin-thread-back"));

    await screen.findByTestId(`admin-ticket-${t.id}`);
    expect(screen.queryByTestId(`admin-unread-${t.id}`)).toBeNull();
  });

  it("recategorizes in place and stamps it on the timeline", async () => {
    const t = await createTicket({ subject: "Mislabeled", body: "x", category: "other" });

    renderWithProviders(<AdminSupportCards active />);
    fireEvent.click(await screen.findByTestId(`admin-ticket-${t.id}`));

    const select = await screen.findByTestId("admin-category-select");
    fireEvent.change(select, { target: { value: "billing" } });

    await screen.findByTestId("admin-event-recategorized");
    expect((await fetchThread(t.id)).ticket.category).toBe("billing");
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
