import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpDown, LifeBuoy, Loader2, Plus, Send } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { logout } from "@/accounts/login-flow";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { isValidEmail } from "@/lib/email";
import { isUnread, markSeen } from "@/lib/supportSeen";
import {
  SUPPORT_CATEGORIES,
  categoryLabel,
  createTicket,
  fetchSupport,
  fetchThread,
  postMessage,
  type SupportTicket,
} from "@/services/support";
import type { Tone } from "@/lib/tones";

const SUPPORT_KEY = ["/user/support"];
const SUPPORT_EMAIL = "support@nosfabrica.com";
const SUBJECT_MAX = 120;
const BODY_MAX = 4000;

/**
 * Deflection: when a category is picked, offer the FAQ entries that answer the
 * common cases BEFORE the ticket is filed (Salesforce's highest-ROI trick).
 * Hand-kept and deliberately sparse — only categories the FAQ actually covers.
 * This same hook is where a knowledge-base/AI answerer plugs in later.
 */
const FAQ_DEFLECTION: Record<string, string[]> = {
  scores: [
    "Why is my score different from what someone else sees?",
    "How does GrapeRank calculate trust?",
  ],
  account: ["What does my Verification Score mean?"],
};

/** Known statuses get meaningful color; the set is open — unknowns stay neutral. */
function statusTone(status: string): Tone {
  if (status === "open") return "info";
  if (status === "answered") return "success";
  if (status === "closed") return "neutral";
  return "neutral";
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
}

/** Lifecycle lines in the user's voice; unknown event types render plainly. */
function userEventLabel(e: { type: string; by: string }): string {
  if (e.type === "opened") return "Ticket opened";
  if (e.type === "closed") return e.by === "support" ? "Closed by Brainstorm Support" : "Closed";
  if (e.type === "reopened") return e.by === "user" ? "Reopened by your reply" : "Reopened";
  if (e.type === "recategorized") return "Category updated by Brainstorm Support";
  return e.type.replaceAll("_", " ");
}

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/40";

/**
 * Priority support — in-app tickets for paid users. The thread here is the
 * source of truth; the optional email only receives reply notifications from
 * support@nosfabrica.com. Entitlement comes from the support API itself
 * (server-decided), so this page has zero dependency on billing code.
 */
export default function SupportPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const user = useActiveAccountDisplay();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const supportQuery = useQuery({ queryKey: SUPPORT_KEY, queryFn: fetchSupport, staleTime: 30_000 });
  const allowed = supportQuery.data?.allowed;
  const tickets = supportQuery.data?.tickets ?? [];

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {user && <AppHeader user={user} onLogout={() => logout()} />}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-10" data-testid="page-support">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <LifeBuoy className="h-5 w-5 text-brand-deep dark:text-brand-link" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Priority support
              </h1>
            </div>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Talk directly with the Brainstorm team. Replies land right here.
            </p>
          </div>
          {allowed && !selectedId && (
            <Button onClick={() => setComposerOpen(true)} className="gap-1.5 shrink-0" data-testid="button-new-ticket">
              <Plus className="h-4 w-4" /> New ticket
            </Button>
          )}
        </div>

        <div className="mt-6">
          {supportQuery.isPending ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : allowed === false ? (
            <Teaser />
          ) : selectedId ? (
            <ThreadView id={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <TicketList tickets={tickets} onOpen={setSelectedId} onNew={() => setComposerOpen(true)} />
          )}
        </div>

        <NewTicketDialog
          open={composerOpen}
          onOpenChange={setComposerOpen}
          onCreated={(t) => {
            setComposerOpen(false);
            setSelectedId(t.id);
            void qc.invalidateQueries({ queryKey: SUPPORT_KEY });
            toast({ title: "Ticket filed", description: "The team will get back to you here." });
          }}
        />
      </main>
    </div>
  );
}

/** What a free account sees: the perk exists, and where it comes from. */
function Teaser() {
  return (
    <Card className="p-6 sm:p-8 text-center" data-testid="support-teaser">
      <LifeBuoy className="mx-auto h-8 w-8 text-brand-deep dark:text-brand-link" />
      <h2 className="mt-3 text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
        Priority support comes with Priority
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Direct tickets with the Brainstorm team are part of the paid plan. Everyone can always reach
        us the community way — answers to common questions live in the FAQ.
      </p>
      <div className="mt-4">
        <Link href="/faq" className="text-sm font-medium text-brand-link hover:underline">
          Browse the FAQ →
        </Link>
      </div>
    </Card>
  );
}

const STATUS_FILTERS = ["all", "open", "answered", "closed"] as const;

function TicketList({
  tickets,
  onOpen,
  onNew,
}: {
  tickets: SupportTicket[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [oldestFirst, setOldestFirst] = useState(false);
  const filtered = statusFilter === "all" ? tickets : tickets.filter((t) => t.status === statusFilter);
  const visible = [...filtered].sort((a, b) =>
    oldestFirst ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
  );

  if (tickets.length === 0) {
    return (
      <Card className="p-6 sm:p-8 text-center" data-testid="support-empty">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No tickets yet. When something's off — billing, scores, anything — file one and the team
          answers here.
        </p>
        <Button onClick={onNew} className="mt-4 gap-1.5" data-testid="button-first-ticket">
          <Plus className="h-4 w-4" /> Open your first ticket
        </Button>
      </Card>
    );
  }
  return (
    <div data-testid="support-ticket-list">
      <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="support-status-filters">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
              statusFilter === s
                ? "border-brand-accent/50 bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                : "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-brand-accent/30"
            }`}
            aria-pressed={statusFilter === s}
            data-testid={`filter-${s}`}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOldestFirst((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-brand-accent/30"
          data-testid="sort-toggle"
        >
          <ArrowUpDown className="h-3 w-3" /> {oldestFirst ? "Oldest first" : "Newest first"}
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="support-filter-empty">
          No {statusFilter} tickets.
        </p>
      ) : (
        <div className="space-y-2.5">
          {visible.map((t) => (
            <Card
              key={t.id}
              interactive
              className="flex items-stretch gap-0 p-0 cursor-pointer overflow-hidden"
              onClick={() => onOpen(t.id)}
              data-testid={`ticket-${t.id}`}
            >
              {/* Date rail first — a ticket reads by WHEN before what. */}
              <div
                className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center border-r border-slate-100 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/60 px-2 py-3.5 text-center"
                data-testid={`ticket-date-${t.id}`}
              >
                <span className="text-[13px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {fmtDate(t.createdAt)}
                </span>
                <span className="mt-0.5 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                  {fmtTime(t.createdAt)}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {isUnread("user", t) && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-brand-accent"
                        aria-label="New reply"
                        data-testid={`ticket-unread-${t.id}`}
                      />
                    )}
                    <span className="truncate" data-testid={`ticket-subject-${t.id}`}>{t.subject}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {[
                      t.category ? categoryLabel(t.category) : null,
                      t.closedAt
                        ? `Closed ${fmtWhen(t.closedAt)}`
                        : `${t.lastMessageAuthor === "support" ? "Brainstorm Support replied" : "You"} ${fmtWhen(t.lastMessageAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Chip tone={statusTone(t.status)} size="sm">{t.status}</Chip>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const threadQuery = useQuery({
    queryKey: [...SUPPORT_KEY, id],
    queryFn: () => fetchThread(id),
  });

  const ticket = threadQuery.data?.ticket;
  const messages = threadQuery.data?.messages ?? [];
  const events = threadQuery.data?.events ?? [];
  const closed = ticket?.status === "closed";

  // Being here IS seeing it — the dot's whole meaning. Re-marks when a new
  // message lands while the thread is open.
  const lastMessageAt = ticket?.lastMessageAt;
  useEffect(() => {
    if (lastMessageAt) markSeen("user", id);
  }, [id, lastMessageAt]);

  // One timeline: messages and lifecycle moments, in the order they happened.
  const timeline = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, message: m })),
    ...events.map((e) => ({ kind: "event" as const, at: e.at, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "event" ? -1 : 1));

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await postMessage(id, body);
      setDraft("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...SUPPORT_KEY, id] }),
        qc.invalidateQueries({ queryKey: SUPPORT_KEY, exact: true }),
      ]);
    } catch (e) {
      toast({
        title: "Couldn't send",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="support-thread">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        data-testid="thread-back"
      >
        <ArrowLeft className="h-4 w-4" /> All tickets
      </button>

      {threadQuery.isPending || !ticket ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
              {ticket.subject}
            </h2>
            <Chip tone={statusTone(ticket.status)} size="sm" data-testid="thread-status">{ticket.status}</Chip>
          </div>

          <div className="mt-4 space-y-3">
            {timeline.map((item, i) =>
              item.kind === "message" ? (
                <div
                  key={item.message.id}
                  className={`max-w-[85%] rounded-2xl border p-3.5 text-sm ${
                    item.message.author === "support"
                      ? "border-brand-accent/25 bg-brand-primary/[0.05] dark:bg-brand-primary/10"
                      : "ml-auto border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  }`}
                  data-testid={`message-${item.message.author}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {item.message.author === "support" ? `Brainstorm Support · ${SUPPORT_EMAIL}` : "You"}
                    <span className="ml-2 font-normal normal-case tracking-normal">{fmtWhen(item.message.createdAt)}</span>
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{item.message.body}</p>
                </div>
              ) : (
                <p
                  key={`ev-${i}`}
                  className="text-center text-[11px] text-slate-400 dark:text-slate-500"
                  data-testid={`ticket-event-${item.event.type}`}
                >
                  — {userEventLabel(item.event)} · {fmtWhen(item.event.at)} —
                </p>
              ),
            )}
          </div>

          {/* Closed is not a wall: replying IS reopening — no button to learn. */}
          {closed && (
            <p className="mt-5 text-sm text-slate-400 dark:text-slate-500" data-testid="thread-closed-note">
              This ticket is closed — replying reopens it.
            </p>
          )}
          <div className={closed ? "mt-2 flex items-end gap-2" : "mt-5 flex items-end gap-2"}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX))}
              placeholder={closed ? "Reply to reopen…" : "Write a reply…"}
              rows={3}
              className={`${inputCls} resize-y`}
              data-testid="thread-reply-input"
            />
            <Button
              onClick={() => void send()}
              disabled={sending || !draft.trim()}
              className="gap-1.5 shrink-0"
              data-testid="thread-reply-send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (t: SupportTicket) => void;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const deflection = category ? (FAQ_DEFLECTION[category] ?? []) : [];

  const submit = async () => {
    if (!category) return;
    const trimmedEmail = email.trim();
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      setEmailError("That doesn't look like an email address.");
      return;
    }
    setEmailError(null);
    setBusy(true);
    try {
      const t = await createTicket({
        subject: subject.trim(),
        body: body.trim(),
        category,
        notifyEmail: trimmedEmail || undefined,
      });
      setSubject("");
      setBody("");
      setCategory(null);
      setEmail("");
      onCreated(t);
    } catch (e) {
      toast({
        title: "Couldn't file the ticket",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg" data-testid="new-ticket-dialog">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>
            The conversation happens here in the app. Your npub identifies you — nothing else needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              What's it about?
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="ticket-categories">
              {SUPPORT_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === c.key
                      ? "border-brand-accent/50 bg-brand-primary/10 text-brand-deep dark:text-brand-link"
                      : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-brand-accent/30"
                  }`}
                  aria-pressed={category === c.key}
                  data-testid={`category-${c.key}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {deflection.length > 0 && (
              <div
                className="mt-2 rounded-xl border border-sky-200/60 dark:border-sky-400/20 bg-sky-50/60 dark:bg-sky-400/[0.06] px-3 py-2"
                data-testid="ticket-deflection"
              >
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Before you file — the FAQ answers these:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {deflection.map((q) => (
                    <li key={q}>
                      <Link href="/faq" className="text-xs text-brand-link hover:underline">
                        {q} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
            placeholder="Subject"
            className={inputCls}
            data-testid="ticket-subject"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            placeholder="What's going on? Include anything that helps us reproduce it."
            rows={5}
            className={`${inputCls} resize-y`}
            data-testid="ticket-body"
          />
          <div>
            <input
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              placeholder="Email for reply notifications (optional)"
              inputMode="email"
              className={inputCls}
              data-testid="ticket-email"
            />
            {emailError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" data-testid="ticket-email-error">
                {emailError}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Replies land here in the app either way — email is only a heads-up, sent from {SUPPORT_EMAIL}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || !category || !subject.trim() || !body.trim()}
            data-testid="ticket-submit"
          >
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} File ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
