// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CALLER, fakeSupport } from "@/test/fakeSupportServer";
import {
  adminCloseTicket,
  adminFetchThread,
  adminListTickets,
  adminReply,
  adminSetCategory,
  createTicket,
  fetchSupport,
  fetchThread,
  postMessage,
  resolveTicket,
} from "./support";

vi.mock("@/services/api/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  adminJson: (path: string, _fallback: string, init?: RequestInit) => fakeSupport.handle(path, init),
}));

describe("priority support seam (against the fake server)", () => {
  beforeEach(() => fakeSupport.reset());

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

  // Users can end their own tickets — self-solved issues shouldn't sit in the
  // admin queue. The record shows WHO closed, and replying still reopens.
  it("a user can mark their own ticket resolved", async () => {
    const t = await createTicket({ subject: "Solved it", body: "x", category: "other" });
    await resolveTicket(t.id);

    const thread = await fetchThread(t.id);
    expect(thread.ticket.status).toBe("closed");
    expect(thread.events.at(-1)).toMatchObject({ type: "closed", by: "user" });

    await postMessage(t.id, "Spoke too soon.");
    expect((await fetchThread(t.id)).ticket.status).toBe("open");
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

  it("the thread knows its requester — pubkey and the notification email", async () => {
    const t = await createTicket({
      subject: "Who am I",
      body: "x",
      category: "other",
      notifyEmail: "ben@practicepilot.ai",
    });

    const thread = await fetchThread(t.id);
    expect(thread.requester.notifyEmail).toBe("ben@practicepilot.ai");
    expect(thread.requester.pubkey).toBe(CALLER);

    const plain = await createTicket({ subject: "No email", body: "y", category: "other" });
    expect((await fetchThread(plain.id)).requester.notifyEmail).toBeNull();
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

  it("passes the server's no-entitlement answer straight through", async () => {
    fakeSupport.allowed = false;
    const state = await fetchSupport();
    expect(state.allowed).toBe(false);
    await expect(createTicket({ subject: "x", body: "y", category: "other" })).rejects.toThrow(
      "Support isn't included in your plan.",
    );
  });

  // The server's columns are naive UTC; read as local they'd drift by the offset.
  it("reads the server's naive timestamps as UTC", async () => {
    const t = fakeSupport.seed({ subject: "Clock", created_at: "2026-08-20T09:00:00.123456" });
    t.last_message_at = t.created_at;
    const { tickets } = await fetchSupport();
    expect(tickets[0].createdAt).toBe("2026-08-20T09:00:00.123Z");
  });

  // The user endpoint only serves the caller's own tickets; the queue is everyone's.
  it("the admin reads any requester's thread; the user side can't", async () => {
    const other = "b".repeat(64);
    const t = fakeSupport.seed({ subject: "Someone else's", pubkey: other, notify_email: "o@example.com" });

    await expect(fetchThread(String(t.id))).rejects.toThrow("No such ticket.");
    const thread = await adminFetchThread(String(t.id));
    expect(thread.requester).toEqual({ pubkey: other, notifyEmail: "o@example.com" });
    const [row] = await adminListTickets();
    expect(row).toMatchObject({ id: String(t.id), pubkey: other, notifyEmail: "o@example.com" });
  });
});
