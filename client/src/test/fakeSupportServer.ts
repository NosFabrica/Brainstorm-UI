/**
 * In-memory stand-in for brainstorm_server's /user/support and /admin/support,
 * answering in the server's wire shapes (snake_case, integer ids, naive UTC
 * timestamps) so tests exercise services/support.ts's translation too.
 *
 * Wire it in by replacing `adminJson`:
 *
 *   vi.mock("@/services/api/core", async (importOriginal) => ({
 *     ...(await importOriginal<object>()),
 *     adminJson: (path: string, _f: string, init?: RequestInit) => fakeSupport.handle(path, init),
 *   }));
 *
 * Status rules mirror the server's `_set_status`: only closing and leaving
 * closed record events, a no-op move records nothing.
 */

export const CALLER = "a".repeat(64);
const ADMIN = "f".repeat(64);

type Author = "user" | "support";

export interface FakeTicket {
  id: number;
  pubkey: string;
  subject: string;
  category: string;
  status: string;
  notify_email: string | null;
  diagnostics: Record<string, string> | null;
  created_at: string;
  last_message_at: string;
  last_message_author: Author;
  closed_at: string | null;
  messages: { id: number; author: Author; body: string; created_at: string }[];
  events: { type: string; at: string; by: Author }[];
}

// Behind the wall clock: lib/supportSeen stamps "seen" with the real now.
let clock = Date.now() - 86_400_000;
/** Naive, like the server's columns; one second apart so order never ties. */
function now(): string {
  clock += 1000;
  return new Date(clock).toISOString().replace("Z", "");
}

function httpError(detail: string): Error {
  return new Error(detail);
}

export const fakeSupport = {
  tickets: [] as FakeTicket[],
  allowed: true,
  nextId: 1,

  reset() {
    this.tickets = [];
    this.allowed = true;
    this.nextId = 1;
  },

  /** A ticket filed by anyone — the admin queue's view of other users. */
  seed(fields: Partial<FakeTicket> & { subject: string }): FakeTicket {
    const at = fields.created_at ?? now();
    const id = this.nextId++;
    const ticket: FakeTicket = {
      id,
      pubkey: CALLER,
      category: "other",
      status: "open",
      notify_email: null,
      diagnostics: null,
      created_at: at,
      last_message_at: at,
      last_message_author: "user",
      closed_at: null,
      messages: [{ id: this.nextId++, author: "user", body: "seeded", created_at: at }],
      events: [{ type: "opened", at, by: "user" }],
      ...fields,
    };
    this.tickets.push(ticket);
    return ticket;
  },

  async handle(path: string, init: RequestInit = {}): Promise<unknown> {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const [route] = path.split("?");
    const m = route.match(/^\/(user|admin)\/support(?:\/tickets(?:\/(\d+))?(?:\/(\w+))?)?$/);
    if (!m) throw httpError(`fake support server: no route for ${method} ${path}`);
    const [, scope, rawId, verb] = m;
    const admin = scope === "admin";

    if (!rawId) {
      if (method === "GET" && !route.endsWith("/tickets")) {
        const mine = this.tickets.filter((t) => t.pubkey === CALLER).sort(byActivity).map(summary);
        return { support_included: this.allowed, tickets: page(mine) };
      }
      if (method === "GET" && admin) return page([...this.tickets].sort(byActivity).map(adminSummary));
      if (method === "POST" && !admin) {
        if (!this.allowed) throw httpError("Support isn't included in your plan.");
        const at = now();
        const ticket = this.seed({
          subject: body.subject,
          category: body.category,
          notify_email: body.notify_email ?? null,
          diagnostics: body.diagnostics ?? null,
          created_at: at,
          messages: [],
        });
        ticket.messages.push({ id: this.nextId++, author: "user", body: body.body, created_at: at });
        return summary(ticket);
      }
      throw httpError(`fake support server: ${method} ${path}`);
    }

    const ticket = this.tickets.find((t) => t.id === Number(rawId) && (admin || t.pubkey === CALLER));
    if (!ticket) throw httpError("No such ticket.");
    const who: Author = admin ? "support" : "user";

    if (method === "GET") return thread(ticket, admin);
    if (method === "PATCH" && admin) {
      if (ticket.category !== body.category) {
        ticket.category = body.category;
        ticket.events.push({ type: "recategorized", at: now(), by: "support" });
      }
      return adminSummary(ticket);
    }
    if (verb === "messages") {
      if (!admin && !this.allowed) throw httpError("Support isn't included in your plan.");
      const message = append(ticket, who, body.body);
      setStatus(ticket, admin ? "answered" : "open", who);
      return admin ? { ...message, actor_pubkey: ADMIN } : message;
    }
    if (verb === "resolve" && !admin) {
      setStatus(ticket, "closed", "user");
      return summary(ticket);
    }
    if (verb === "close" && admin) {
      if (body.message != null) append(ticket, "support", body.message);
      setStatus(ticket, "closed", "support");
      return adminSummary(ticket);
    }
    throw httpError(`fake support server: ${method} ${path}`);

    function append(t: FakeTicket, author: Author, text: string) {
      const message = { id: fakeSupport.nextId++, author, body: text, created_at: now() };
      t.messages.push(message);
      t.last_message_at = message.created_at;
      t.last_message_author = author;
      return message;
    }
  },
};

function setStatus(t: FakeTicket, status: string, by: Author): void {
  const was = t.status;
  if (was === status) return;
  if (status === "closed") {
    t.closed_at = now();
    t.events.push({ type: "closed", at: t.closed_at, by });
  } else if (was === "closed") {
    t.closed_at = null;
    t.events.push({ type: "reopened", at: now(), by });
  }
  t.status = status;
}

function byActivity(a: FakeTicket, b: FakeTicket): number {
  return b.last_message_at.localeCompare(a.last_message_at);
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, size: 100, pages: 1 };
}

function summary(t: FakeTicket) {
  const { pubkey: _p, notify_email: _e, diagnostics: _d, messages: _m, events: _ev, ...rest } = t;
  return rest;
}

function adminSummary(t: FakeTicket) {
  return { ...summary(t), pubkey: t.pubkey, notify_email: t.notify_email };
}

function thread(t: FakeTicket, admin: boolean) {
  return {
    ticket: admin ? adminSummary(t) : summary(t),
    messages: t.messages.map((m) => (admin ? { ...m, actor_pubkey: m.author === "support" ? ADMIN : null } : m)),
    events: t.events.map((e) => (admin ? { ...e, actor_pubkey: null } : e)),
    diagnostics: t.diagnostics,
    requester: { pubkey: t.pubkey, notify_email: t.notify_email },
  };
}
