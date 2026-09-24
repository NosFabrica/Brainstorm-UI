/**
 * Priority support — every UI surface talks to these functions, which wrap
 * the server's /user/support and /admin/support endpoints and translate its
 * snake_case wire shapes into the camelCase ones the components use.
 *
 * - The SERVER owns the entitlement: `fetchSupport()` answers `allowed` from
 *   the caller's Policy (`support_included`).
 * - The in-app thread is the source of truth; email is an optional outbound
 *   notification channel. No inbound parsing.
 * - Statuses are an OPEN SET — render the ones we know, never crash on new.
 */

import { adminJson, jsonBody } from "@/services/api/core";

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
  /** When the ticket was (last) closed — null while it isn't. */
  closedAt: string | null;
}

export interface SupportMessage {
  id: string;
  author: "user" | "support";
  body: string;
  createdAt: string;
}

/**
 * A lifecycle moment, on the record: opened/closed/reopened (open set),
 * stamped and attributed — "when was this closed?" is never a shrug.
 */
export interface TicketEvent {
  type: string; // known: "opened" | "closed" | "reopened"
  at: string;
  by: "user" | "support";
}

export interface SupportState {
  /** Server-decided entitlement (paid users). False renders the teaser. */
  allowed: boolean;
  tickets: SupportTicket[];
}

export interface SupportThread {
  ticket: SupportTicket;
  messages: SupportMessage[];
  events: TicketEvent[];
  diagnostics: Record<string, string> | null;
  /** Who filed it, and where their notifications go (their own data — the
   *  user sees what support sees). */
  requester: { pubkey: string; notifyEmail: string | null };
}

/** Admin rows carry the requester. */
export type AdminSupportTicket = SupportTicket & {
  pubkey: string;
  notifyEmail: string | null;
};

// --- Wire shapes ----------------------------------------------------------------

type Raw = Record<string, unknown>;

// The server's page ceiling. Neither list pages yet, so ask for all it allows.
const PAGE = "page=1&size=100";

/** Support timestamps are naive UTC on the wire; pin them before JS reads local. */
function instant(value: unknown): string {
  const s = String(value ?? "");
  const d = new Date(/(Z|[+-]\d{2}:\d{2})$/i.test(s) ? s : `${s}Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : s;
}

function author(value: unknown): "user" | "support" {
  return value === "support" ? "support" : "user";
}

function toTicket(r: Raw): SupportTicket {
  return {
    id: String(r.id),
    subject: String(r.subject ?? ""),
    category: String(r.category ?? ""),
    status: String(r.status ?? ""),
    createdAt: instant(r.created_at),
    lastMessageAt: instant(r.last_message_at),
    lastMessageAuthor: author(r.last_message_author),
    closedAt: r.closed_at ? instant(r.closed_at) : null,
  };
}

function toAdminTicket(r: Raw): AdminSupportTicket {
  return {
    ...toTicket(r),
    pubkey: String(r.pubkey ?? ""),
    notifyEmail: (r.notify_email as string | null) ?? null,
  };
}

function toMessage(r: Raw): SupportMessage {
  return {
    id: String(r.id),
    author: author(r.author),
    body: String(r.body ?? ""),
    createdAt: instant(r.created_at),
  };
}

function toThread(r: Raw): SupportThread {
  const requester = (r.requester ?? {}) as Raw;
  return {
    ticket: toTicket(r.ticket as Raw),
    messages: ((r.messages ?? []) as Raw[]).map(toMessage),
    events: ((r.events ?? []) as Raw[]).map((e) => ({
      type: String(e.type ?? ""),
      at: instant(e.at),
      by: author(e.by),
    })),
    diagnostics: (r.diagnostics as Record<string, string> | null) ?? null,
    requester: {
      pubkey: String(requester.pubkey ?? ""),
      notifyEmail: (requester.notify_email as string | null) ?? null,
    },
  };
}

function ticketPath(scope: "user" | "admin", id: string): string {
  return `/${scope}/support/tickets/${encodeURIComponent(id)}`;
}

// --- User -------------------------------------------------------------------------

export async function fetchSupport(): Promise<SupportState> {
  const r = await adminJson<{ support_included: boolean; tickets: { items: Raw[] } }>(
    `/user/support?${PAGE}`,
    "Couldn't load support",
  );
  return { allowed: r.support_included, tickets: r.tickets.items.map(toTicket) };
}

export async function createTicket(input: {
  subject: string;
  body: string;
  category: string;
  notifyEmail?: string;
  /** Client-collected snapshot (lib/supportDiagnostics) — optional, opt-out. */
  diagnostics?: Record<string, string>;
}): Promise<SupportTicket> {
  const r = await adminJson<Raw>(
    "/user/support/tickets",
    "Couldn't file the ticket",
    jsonBody("POST", {
      subject: input.subject,
      body: input.body,
      category: input.category,
      notify_email: input.notifyEmail || null,
      diagnostics: input.diagnostics ?? null,
    }),
  );
  return toTicket(r);
}

export async function fetchThread(id: string): Promise<SupportThread> {
  return toThread(await adminJson<Raw>(ticketPath("user", id), "Couldn't load the ticket"));
}

/** A user reply always reopens — replying IS reopening; no button to learn. */
export async function postMessage(id: string, body: string): Promise<SupportMessage> {
  const r = await adminJson<Raw>(
    `${ticketPath("user", id)}/messages`,
    "Couldn't send the reply",
    jsonBody("POST", { body }),
  );
  return toMessage(r);
}

/** User self-close — "solved it myself" shouldn't sit in the admin queue. */
export async function resolveTicket(id: string): Promise<void> {
  await adminJson(`${ticketPath("user", id)}/resolve`, "Couldn't resolve the ticket", { method: "POST" });
}

// --- Admin ------------------------------------------------------------------------

export async function adminListTickets(): Promise<AdminSupportTicket[]> {
  const r = await adminJson<{ items: Raw[] }>(`/admin/support/tickets?${PAGE}`, "Couldn't load tickets");
  return r.items.map(toAdminTicket);
}

/** Any ticket, not just the caller's — the user endpoint would 404 these. */
export async function adminFetchThread(id: string): Promise<SupportThread> {
  return toThread(await adminJson<Raw>(ticketPath("admin", id), "Couldn't load the ticket"));
}

export async function adminReply(id: string, body: string): Promise<SupportMessage> {
  const r = await adminJson<Raw>(
    `${ticketPath("admin", id)}/messages`,
    "Couldn't send the reply",
    jsonBody("POST", { body }),
  );
  return toMessage(r);
}

/** Close, optionally with a final support message (queued in the confirm
 *  dialog and sent only on the admin's press — never auto-sent). */
export async function adminCloseTicket(id: string, closingMessage?: string): Promise<void> {
  const message = closingMessage?.trim() || null;
  await adminJson(`${ticketPath("admin", id)}/close`, "Couldn't close the ticket", jsonBody("POST", { message }));
}

/** Recategorize — category drives the filters and (later) KB routing. */
export async function adminSetCategory(id: string, category: string): Promise<void> {
  await adminJson(ticketPath("admin", id), "Couldn't change the category", jsonBody("PATCH", { category }));
}
