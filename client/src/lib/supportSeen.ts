import type { SupportTicket } from "@/services/support";

/**
 * Per-device unread tracking for support tickets — the notification dot's
 * source of truth. Deliberately device-local (like the dismissal stores):
 * zero server surface, honest semantics ("I haven't looked at this HERE"),
 * and the same code serves both viewpoints:
 *
 * - "user": pending when SUPPORT spoke last and you haven't opened it since.
 * - "admin": pending when the USER spoke last — exactly the work queue.
 *
 * Opening a thread marks it seen. Your own words are never unread to you.
 */

export type SeenScope = "user" | "admin";

const KEY: Record<SeenScope, string> = {
  user: "brainstorm_support_seen",
  admin: "brainstorm_support_seen_admin",
};

function readSeen(scope: SeenScope): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY[scope]);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function markSeen(scope: SeenScope, ticketId: string): void {
  try {
    const seen = readSeen(scope);
    seen[ticketId] = new Date().toISOString();
    localStorage.setItem(KEY[scope], JSON.stringify(seen));
  } catch {
    /* storage failures cost a dot, never a crash */
  }
}

export function isUnread(scope: SeenScope, ticket: SupportTicket): boolean {
  const otherSide = scope === "user" ? "support" : "user";
  if (ticket.lastMessageAuthor !== otherSide) return false;
  const seenAt = readSeen(scope)[ticket.id];
  return !seenAt || seenAt < ticket.lastMessageAt;
}

export function unreadCount(scope: SeenScope, tickets: SupportTicket[]): number {
  return tickets.filter((t) => isUnread(scope, t)).length;
}
