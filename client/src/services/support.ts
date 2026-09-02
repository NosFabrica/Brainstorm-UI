/**
 * Priority support — the ONLY mock/real switch for the ticket system, same
 * seam pattern as billing's services/subscription.ts: every UI surface talks
 * to these functions, and flipping `FEATURES.supportApi` (once the server
 * ships /user/support/*) retires the mock without touching a component.
 *
 * Design (docs/support/SUPPORT-CONTRACT.md):
 * - The SERVER owns the entitlement: `fetchSupport()` answers `allowed` from
 *   its billing ledger. The UI never imports billing code — this feature has
 *   zero dependency on the flash-payments branch.
 * - The in-app thread is the source of truth; email is an optional outbound
 *   notification channel (from support@nosfabrica.com). No inbound parsing.
 * - Statuses are an OPEN SET — render the ones we know, never crash on new.
 */

export type TicketStatus = string; // known values: "open" | "answered" | "closed"

/**
 * The launch category set — product-shaped, because each key is a routing and
 * (later) knowledge-base hook: the same chip that files the ticket is where a
 * FAQ hint or an AI answerer plugs in. Category is an OPEN SET on the wire
 * (server stores verbatim); this list is what the composer offers.
 */
export const SUPPORT_CATEGORIES = [
  { key: "billing", label: "Billing & plan" },
  { key: "scores", label: "Scores & calculation" },
  { key: "alerts", label: "Alerts & notifications" },
  { key: "account", label: "Account & keys" },
  { key: "bug", label: "Bug report" },
  { key: "other", label: "Something else" },
] as const;

export type SupportCategoryKey = (typeof SUPPORT_CATEGORIES)[number]["key"];

/** Label for a category value, tolerating unknown/legacy values (open set). */
export function categoryLabel(key: string): string {
  return SUPPORT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
  lastMessageAt: string;
  /** Who spoke last — lets a card say "Brainstorm Support replied" at a glance. */
  lastMessageAuthor: "user" | "support";
}

export interface SupportMessage {
  id: string;
  author: "user" | "support";
  body: string;
  createdAt: string;
}

export interface SupportState {
  /** Server-decided entitlement (paid users). False renders the teaser. */
  allowed: boolean;
  tickets: SupportTicket[];
}

// --- Mock store (localStorage) ------------------------------------------------
// The admin Support tab reads the SAME store, so the full demo loop — file as
// user, reply from admin, read the reply as user — works with zero server.

const MOCK_KEY = "brainstorm_mock_support";
/** QA override: set to "false" to rehearse the free-user teaser locally. */
const MOCK_ALLOWED_KEY = "brainstorm_mock_support_allowed";

function mockAllowed(): boolean {
  try {
    return localStorage.getItem(MOCK_ALLOWED_KEY) !== "false";
  } catch {
    return true;
  }
}

interface MockStore {
  // `pubkey` appears when a store row mimics the server's attributed shape
  // (tests/rehearsals); tickets filed through this browser's mock have none.
  // `lastMessageAuthor` is derived from messages at read time, not stored.
  tickets: (Omit<SupportTicket, "lastMessageAuthor"> & {
    messages: SupportMessage[];
    notifyEmail?: string;
    pubkey?: string;
  })[];
}

type StoredTicket = MockStore["tickets"][number];

/** The public ticket summary: messages stay behind fetchThread. */
function toPublic(t: StoredTicket): SupportTicket {
  const { messages, notifyEmail: _e, pubkey: _p, ...pub } = t;
  return { ...pub, lastMessageAuthor: messages.at(-1)?.author ?? "user" };
}

function readStore(): MockStore {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tickets)) return parsed as MockStore;
    }
  } catch {
    /* fall through */
  }
  return { tickets: [] };
}

function writeStore(store: MockStore): void {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(store));
  } catch {
    /* storage failures leave the demo stateless, never broken */
  }
}

function mockId(): string {
  return `tkt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// --- Public seam --------------------------------------------------------------

export async function fetchSupport(): Promise<SupportState> {
  if (!mockAllowed()) return { allowed: false, tickets: [] };
  const store = readStore();
  return {
    allowed: true,
    tickets: store.tickets
      .map(toPublic)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
  };
}

export async function createTicket(input: {
  subject: string;
  body: string;
  category: string;
  notifyEmail?: string;
}): Promise<SupportTicket> {
  const now = new Date().toISOString();
  const ticket: StoredTicket = {
    id: mockId(),
    subject: input.subject,
    category: input.category,
    status: "open",
    createdAt: now,
    lastMessageAt: now,
    notifyEmail: input.notifyEmail || undefined,
    messages: [{ id: mockId(), author: "user", body: input.body, createdAt: now }],
  };
  const store = readStore();
  store.tickets.push(ticket);
  writeStore(store);
  return toPublic(ticket);
}

export async function fetchThread(
  id: string,
): Promise<{ ticket: SupportTicket; messages: SupportMessage[] }> {
  const found = readStore().tickets.find((t) => t.id === id);
  if (!found) throw new Error("Ticket not found");
  return {
    ticket: toPublic(found),
    messages: [...found.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export async function postMessage(id: string, body: string): Promise<SupportMessage> {
  const message = appendMessage(id, "user", body);
  // A user reply always puts the ticket back in support's court — including
  // reopening a closed one (replying IS reopening; no button to learn).
  setStatus(id, "open");
  return message;
}

// --- Admin seam (the Support tab; same mock store = full local demo loop) -----

/** Admin rows carry the requester. Mock tickets are browser-local, so pubkey
 *  is null there; the real endpoint identifies every requester. */
export type AdminSupportTicket = SupportTicket & {
  pubkey: string | null;
  notifyEmail: string | null;
};

export async function adminListTickets(): Promise<AdminSupportTicket[]> {
  return readStore()
    .tickets.map((t) => ({
      ...toPublic(t),
      pubkey: t.pubkey ?? null,
      notifyEmail: t.notifyEmail ?? null,
    }))
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export async function adminReply(id: string, body: string): Promise<SupportMessage> {
  const message = appendMessage(id, "support", body);
  setStatus(id, "answered");
  return message;
}

/** Close, optionally with a final support message (queued in the confirm
 *  dialog and sent only on the admin's press — never auto-sent). */
export async function adminCloseTicket(id: string, closingMessage?: string): Promise<void> {
  const trimmed = closingMessage?.trim();
  if (trimmed) appendMessage(id, "support", trimmed);
  setStatus(id, "closed");
}

function setStatus(id: string, status: TicketStatus): void {
  const store = readStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) throw new Error("Ticket not found");
  ticket.status = status;
  writeStore(store);
}

function appendMessage(id: string, author: SupportMessage["author"], body: string): SupportMessage {
  const store = readStore();
  const ticket = store.tickets.find((t) => t.id === id);
  if (!ticket) throw new Error("Ticket not found");
  const message: SupportMessage = { id: mockId(), author, body, createdAt: new Date().toISOString() };
  ticket.messages.push(message);
  ticket.lastMessageAt = message.createdAt;
  writeStore(store);
  return message;
}
