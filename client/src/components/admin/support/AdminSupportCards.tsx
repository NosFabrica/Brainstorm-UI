import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import { npubFromPubkey } from "@/lib/shareId";
import {
  adminCloseTicket,
  adminListTickets,
  adminReply,
  fetchThread,
} from "@/services/support";
import type { Tone } from "@/lib/tones";

const ADMIN_SUPPORT_KEY = ["/api/admin/support/tickets"];

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

function requesterLabel(pubkey: string | null): string {
  if (!pubkey) return "this browser (demo)";
  try {
    const npub = npubFromPubkey(pubkey);
    return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const td = "px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200";

/**
 * The admin side of priority support: every ticket, the thread, reply + close.
 * Same seam as the user page, so in mock mode this demos the full loop against
 * the browser-local store before the server exists.
 */
export function AdminSupportCards({ active }: { active: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ADMIN_SUPPORT_KEY,
    queryFn: adminListTickets,
    enabled: active,
    staleTime: 30_000,
  });

  if (listQuery.isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets…
      </div>
    );
  }
  if (listQuery.isError) {
    return (
      <div className="py-6 text-sm text-slate-500 dark:text-slate-400" data-testid="admin-support-error">
        Couldn't load tickets — the server's support endpoint may not be live yet.
      </div>
    );
  }

  const tickets = listQuery.data ?? [];

  if (openId) return <AdminThread id={openId} onBack={() => setOpenId(null)} />;

  if (tickets.length === 0) {
    return (
      <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="admin-support-empty">
        No tickets. When paid users file one, it lands here.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px]" data-testid="table-admin-support">
        <thead>
          <tr className="border-b border-brand-accent/10">
            <th className={th}>Subject</th>
            <th className={th}>From</th>
            <th className={th}>Status</th>
            <th className={th}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr
              key={t.id}
              className="cursor-pointer border-b border-brand-accent/5 hover:bg-slate-50 dark:hover:bg-slate-900/50"
              onClick={() => setOpenId(t.id)}
              data-testid={`admin-ticket-${t.id}`}
            >
              <td className={`${td} font-medium`}>{t.subject}</td>
              <td className={`${td} font-mono text-xs`}>{requesterLabel(t.pubkey)}</td>
              <td className={td}><Chip tone={statusTone(t.status)} size="sm">{t.status}</Chip></td>
              <td className={`${td} tabular-nums`}>{fmtWhen(t.lastMessageAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminThread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const threadQuery = useQuery({
    queryKey: [...ADMIN_SUPPORT_KEY, id],
    queryFn: () => fetchThread(id),
  });
  const ticket = threadQuery.data?.ticket;
  const messages = threadQuery.data?.messages ?? [];
  const closed = ticket?.status === "closed";

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: [...ADMIN_SUPPORT_KEY, id] }),
      qc.invalidateQueries({ queryKey: ADMIN_SUPPORT_KEY, exact: true }),
      // The user-side queries share the store in mock mode — keep them honest too.
      qc.invalidateQueries({ queryKey: ["/user/support"] }),
    ]);

  const reply = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await adminReply(id, body);
      setDraft("");
      await refresh();
      toast({ title: "Reply sent", description: "The user sees it in their thread; email notification goes out when configured." });
    } catch (e) {
      toast({ title: "Reply failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      await adminCloseTicket(id);
      await refresh();
    } catch (e) {
      toast({ title: "Close failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="admin-support-thread">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          data-testid="admin-thread-back"
        >
          <ArrowLeft className="h-4 w-4" /> All tickets
        </button>
        {ticket && !closed && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void close()} className="gap-1.5" data-testid="admin-close-ticket">
            <CheckCircle2 className="h-4 w-4" /> Close ticket
          </Button>
        )}
      </div>

      {threadQuery.isPending || !ticket ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <h4 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>{ticket.subject}</h4>
            <Chip tone={statusTone(ticket.status)} size="sm" data-testid="admin-thread-status">{ticket.status}</Chip>
          </div>

          <div className="mt-3 space-y-2.5">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-xl border p-3 text-sm ${
                  m.author === "support"
                    ? "ml-auto border-brand-accent/25 bg-brand-primary/[0.05] dark:bg-brand-primary/10"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                }`}
                data-testid={`admin-message-${m.author}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {m.author === "support" ? "Support (you)" : "User"}
                  <span className="ml-2 font-normal normal-case tracking-normal">{fmtWhen(m.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{m.body}</p>
              </div>
            ))}
          </div>

          {closed ? (
            <p className="mt-4 text-sm text-slate-400 dark:text-slate-500" data-testid="admin-thread-closed">
              Closed. The user keeps the history; a new issue means a new ticket.
            </p>
          ) : (
            <div className="mt-4 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                placeholder={`Reply as Brainstorm Support…`}
                rows={3}
                className="w-full resize-y rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
                data-testid="admin-reply-input"
              />
              <Button onClick={() => void reply()} disabled={busy || !draft.trim()} className="gap-1.5 shrink-0" data-testid="admin-reply-send">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Reply
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
