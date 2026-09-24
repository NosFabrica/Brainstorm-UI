import type { Tone } from "@/lib/tones";
import type { SupportMessage, TicketEvent } from "@/services/support";

export const SUPPORT_EMAIL = "support@nosfabrica.com";

// Statuses are an open set: unknowns render neutral and sort with closed.
const STATUS_META: Record<string, { tone: Tone; rank: number }> = {
  open: { tone: "info", rank: 0 },
  answered: { tone: "success", rank: 1 },
  closed: { tone: "neutral", rank: 2 },
};
const UNKNOWN_STATUS = { tone: "neutral" as Tone, rank: 2 };

export function statusTone(status: string): Tone {
  return (STATUS_META[status] ?? UNKNOWN_STATUS).tone;
}

/** The work-queue order: open, then answered, then everything else. */
export function statusRank(status: string): number {
  return (STATUS_META[status] ?? UNKNOWN_STATUS).rank;
}

function format(iso: string, fmt: (d: Date) => string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? fmt(d) : "";
}

export const fmtWhen = (iso: string) =>
  format(iso, (d) => d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }));
export const fmtDate = (iso: string) =>
  format(iso, (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
export const fmtTime = (iso: string) =>
  format(iso, (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));

export type TimelineItem =
  | { kind: "message"; at: string; message: SupportMessage }
  | { kind: "event"; at: string; event: TicketEvent };

/** Messages and lifecycle events in the order they happened; an event wins a tie. */
export function buildTimeline(messages: SupportMessage[], events: TicketEvent[]): TimelineItem[] {
  return [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, message: m })),
    ...events.map((e) => ({ kind: "event" as const, at: e.at, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "event" ? -1 : 1));
}
