// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  adminCloseTicket,
  adminReply,
  adminSetCategory,
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

  it("closing can carry a final word — queued by the admin, sent on their press", async () => {
    const t = await createTicket({ subject: "Done", body: "Never mind, solved it.", category: "other" });
    await adminCloseTicket(t.id, "Glad it's sorted — closing this one.");

    const thread = await fetchThread(t.id);
    expect(thread.ticket.status).toBe("closed");
    expect(thread.messages.at(-1)).toMatchObject({ author: "support", body: "Glad it's sorted — closing this one." });
  });

  it("closing silently is one option — no message, just the status", async () => {
    const t = await createTicket({ subject: "Quiet", body: "x", category: "other" });
    await adminCloseTicket(t.id);

    const thread = await fetchThread(t.id);
    expect(thread.ticket.status).toBe("closed");
    expect(thread.messages).toHaveLength(1);
  });

  // The zero-friction reopen: no button, no state machine for the user to
  // learn — replying IS reopening. And any user reply puts the ticket back
  // in support's court, so the admin queue stays honest.
  it("a user reply reopens a closed ticket", async () => {
    const t = await createTicket({ subject: "Back again", body: "x", category: "other" });
    await adminCloseTicket(t.id, "Closing.");

    await postMessage(t.id, "Actually, it's happening again.");

    const thread = await fetchThread(t.id);
    expect(thread.ticket.status).toBe("open");
  });

  // The lifecycle is on the record: opened, closed, reopened — each stamped
  // to the minute and attributed, so "when was this closed?" is never a shrug.
  it("tracks status changes as timestamped events", async () => {
    const t = await createTicket({ subject: "Life cycle", body: "x", category: "other" });
    await adminCloseTicket(t.id, "Closing.");
    await postMessage(t.id, "Reopening you.");
    await adminCloseTicket(t.id);

    const { events } = await fetchThread(t.id);
    expect(events.map((e) => e.type)).toEqual(["opened", "closed", "reopened", "closed"]);
    expect(events.map((e) => e.by)).toEqual(["user", "support", "user", "support"]);
    for (const e of events) expect(Number.isFinite(new Date(e.at).getTime())).toBe(true);
    // The summary answers "when was it closed?" directly.
    const { tickets } = await fetchSupport();
    expect(tickets[0].closedAt).toBe(events.at(-1)!.at);
  });

  it("a ticket can carry a diagnostics snapshot, readable from the thread", async () => {
    const t = await createTicket({
      subject: "Broken here",
      body: "See diagnostics.",
      category: "bug",
      diagnostics: { App: "v0.1.0-alpha", Browser: "TestBrowser/1.0", "Recent errors": "boom" },
    });

    const thread = await fetchThread(t.id);
    expect(thread.diagnostics).toMatchObject({ Browser: "TestBrowser/1.0" });

    // Not sending one is fine — older tickets and opted-out users.
    const plain = await createTicket({ subject: "No diag", body: "x", category: "other" });
    expect((await fetchThread(plain.id)).diagnostics).toBeNull();
  });

  it("admins can recategorize — applied immediately, on the record", async () => {
    const t = await createTicket({ subject: "Mislabeled", body: "x", category: "other" });
    await adminSetCategory(t.id, "billing");

    const thread = await fetchThread(t.id);
    expect(thread.ticket.category).toBe("billing");
    expect(thread.events.at(-1)).toMatchObject({ type: "recategorized", by: "support" });
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
