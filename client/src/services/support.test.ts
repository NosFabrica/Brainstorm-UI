// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminCloseTicket,
  adminReply,
  createTicket,
  fetchSupport,
  fetchThread,
  postMessage,
} from "./support";

/** Mock mode throughout (VITE_FEATURE_SUPPORT_API unset in tests). */
describe("priority support seam (mock mode)", () => {
  beforeEach(() => localStorage.clear());

  it("a paid user files a ticket and finds it in their list", async () => {
    const before = await fetchSupport();
    expect(before.allowed).toBe(true);
    expect(before.tickets).toEqual([]);

    const created = await createTicket({
      subject: "Score seems stuck",
      body: "My score hasn't moved since Friday.",
      category: "scores",
    });

    const after = await fetchSupport();
    expect(after.tickets.map((t) => t.id)).toContain(created.id);
    expect(after.tickets[0].subject).toBe("Score seems stuck");
    expect(after.tickets[0].status).toBe("open");
    expect(after.tickets[0].category).toBe("scores");
  });

  it("the thread opens with the ticket body and grows as the user replies", async () => {
    const t = await createTicket({ subject: "Alerts", body: "Not receiving alerts.", category: "other" });

    const thread = await fetchThread(t.id);
    expect(thread.ticket.id).toBe(t.id);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({ author: "user", body: "Not receiving alerts." });

    await postMessage(t.id, "Still nothing this morning.");
    const grown = await fetchThread(t.id);
    expect(grown.messages.map((m) => m.body)).toEqual([
      "Not receiving alerts.",
      "Still nothing this morning.",
    ]);
  });

  // The admin seam writes to the same store, so the whole loop demos locally.
  it("a support reply reaches the user's thread and marks the ticket answered", async () => {
    const t = await createTicket({ subject: "Billing", body: "Charged twice?", category: "other" });

    await adminReply(t.id, "Checked with Flash — you were charged once; the second row is the invoice preview.");

    const thread = await fetchThread(t.id);
    expect(thread.messages[1]).toMatchObject({ author: "support" });
    expect(thread.ticket.status).toBe("answered");
    const list = await fetchSupport();
    expect(list.tickets[0].status).toBe("answered");
  });

  it("closing a ticket ends the conversation", async () => {
    const t = await createTicket({ subject: "Done", body: "Never mind, solved it.", category: "other" });
    await adminCloseTicket(t.id);

    const thread = await fetchThread(t.id);
    expect(thread.ticket.status).toBe("closed");
  });

  // The server decides entitlement; the mock rehearses a free user via the
  // same kind of localStorage override billing uses for its empty-plans state.
  it("lets QA rehearse the free-user teaser with an override", async () => {
    localStorage.setItem("brainstorm_mock_support_allowed", "false");
    const state = await fetchSupport();
    expect(state.allowed).toBe(false);
    expect(state.tickets).toEqual([]);
  });
});
