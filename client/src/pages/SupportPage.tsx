import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Loader2, Plus, Send } from "lucide-react";
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
import {
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

function TicketList({
  tickets,
  onOpen,
  onNew,
}: {
  tickets: SupportTicket[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
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
    <div className="space-y-2.5" data-testid="support-ticket-list">
      {tickets.map((t) => (
        <Card
          key={t.id}
          interactive
          className="flex items-center justify-between gap-3 p-4 cursor-pointer"
          onClick={() => onOpen(t.id)}
          data-testid={`ticket-${t.id}`}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t.subject}</p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Updated {fmtWhen(t.lastMessageAt)}
            </p>
          </div>
          <Chip tone={statusTone(t.status)} size="sm">{t.status}</Chip>
        </Card>
      ))}
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
  const closed = ticket?.status === "closed";

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
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl border p-3.5 text-sm ${
                  m.author === "support"
                    ? "border-brand-accent/25 bg-brand-primary/[0.05] dark:bg-brand-primary/10"
                    : "ml-auto border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
                data-testid={`message-${m.author}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {m.author === "support" ? `Brainstorm Support · ${SUPPORT_EMAIL}` : "You"}
                  <span className="ml-2 font-normal normal-case tracking-normal">{fmtWhen(m.createdAt)}</span>
                </p>
                <p className="mt-1.5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{m.body}</p>
              </div>
            ))}
          </div>

          {closed ? (
            <p className="mt-5 text-sm text-slate-400 dark:text-slate-500" data-testid="thread-closed-note">
              This ticket is closed. If anything resurfaces, open a new one — the history stays here.
            </p>
          ) : (
            <div className="mt-5 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX))}
                placeholder="Write a reply…"
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
          )}
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
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
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
        notifyEmail: trimmedEmail || undefined,
      });
      setSubject("");
      setBody("");
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
            disabled={busy || !subject.trim() || !body.trim()}
            data-testid="ticket-submit"
          >
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} File ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
