import { SUPPORT_EMAIL, buildTimeline, fmtWhen } from "@/lib/supportDisplay";
import type { SupportMessage, TicketEvent } from "@/services/support";

type Viewer = "user" | "admin";

const VOICE: Record<
  Viewer,
  {
    mine: SupportMessage["author"];
    author: (a: SupportMessage["author"]) => string;
    event: (e: TicketEvent) => string | null;
    messageTestId: string;
    eventTestId: string;
  }
> = {
  user: {
    mine: "user",
    author: (a) => (a === "support" ? `Brainstorm Support · ${SUPPORT_EMAIL}` : "You"),
    event: (e) => {
      if (e.type === "opened") return "Ticket opened";
      if (e.type === "closed") return e.by === "support" ? "Closed by Brainstorm Support" : "You marked this resolved";
      if (e.type === "reopened") return e.by === "user" ? "Reopened by your reply" : "Reopened";
      if (e.type === "recategorized") return "Category updated by Brainstorm Support";
      return null;
    },
    messageTestId: "message",
    eventTestId: "ticket-event",
  },
  admin: {
    mine: "support",
    author: (a) => (a === "support" ? "Support (you)" : "User"),
    event: (e) => {
      if (e.type === "opened") return "Ticket opened";
      if (e.type === "closed") return e.by === "support" ? "Closed by support" : "Resolved by the user";
      if (e.type === "reopened") return e.by === "user" ? "Reopened by the user's reply" : "Reopened";
      if (e.type === "recategorized") return "Recategorized by support";
      return null;
    },
    messageTestId: "admin-message",
    eventTestId: "admin-event",
  },
};

/** One conversation, read from either side: your own messages sit on the right. */
export function SupportTimeline({
  messages,
  events,
  viewer,
}: {
  messages: SupportMessage[];
  events: TicketEvent[];
  viewer: Viewer;
}) {
  const voice = VOICE[viewer];
  return (
    <div className="space-y-3">
      {buildTimeline(messages, events).map((item, i) =>
        item.kind === "message" ? (
          <div
            key={item.message.id}
            className={`max-w-[85%] rounded-2xl border p-3.5 text-sm ${
              item.message.author === voice.mine ? "ml-auto" : ""
            } ${
              item.message.author === "support"
                ? "border-brand-accent/25 bg-brand-primary/[0.05] dark:bg-brand-primary/10"
                : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
            }`}
            data-testid={`${voice.messageTestId}-${item.message.author}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {voice.author(item.message.author)}
              <span className="ml-2 font-normal normal-case tracking-normal">{fmtWhen(item.message.createdAt)}</span>
            </p>
            <p className="mt-1.5 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">{item.message.body}</p>
          </div>
        ) : (
          <p
            key={`ev-${i}`}
            className="text-center text-[11px] text-slate-400 dark:text-slate-500"
            data-testid={`${voice.eventTestId}-${item.event.type}`}
          >
            — {voice.event(item.event) ?? item.event.type.replaceAll("_", " ")} · {fmtWhen(item.event.at)} —
          </p>
        ),
      )}
    </div>
  );
}
