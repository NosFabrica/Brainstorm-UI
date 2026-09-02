import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { useProfileBits, type ProfileBits } from "@/components/admin/useProfileBits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { npubFromPubkey } from "@/lib/shareId";
import { isUnread, markSeen } from "@/lib/supportSeen";
import {
  SUPPORT_CATEGORIES,
  adminCloseTicket,
  adminListTickets,
  adminReply,
  adminSetCategory,
  categoryLabel,
  fetchThread,
  type AdminSupportTicket,
} from "@/services/support";
import type { Tone } from "@/lib/tones";

const ADMIN_SUPPORT_KEY = ["/api/admin/support/tickets"];

/** Queued in the close dialog, editable, and sent only on the admin's press. */
const DEFAULT_CLOSING_MESSAGE =
  "Glad we could help! We're closing this ticket — if anything resurfaces, just reply here and it reopens.";

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

/**
 * Avatar + display name (npub as detail), same treatment as the Users tab.
 * Clicking it filters the queue to this requester — the one-tap
 * "show me all their tickets" view.
 */
function RequesterCell({
  pubkey,
  profile,
  onFilter,
}: {
  pubkey: string | null;
  profile?: ProfileBits;
  onFilter?: (query: string) => void;
}) {
  const label = requesterLabel(pubkey);
  if (!pubkey) return <span className="font-mono text-xs">{label}</span>;
  return (
    <span
      className="flex items-center gap-2 min-w-0 cursor-pointer hover:opacity-80"
      role="button"
      tabIndex={0}
      title="Show all tickets from this user"
      onClick={(e) => {
        e.stopPropagation();
        onFilter?.(label);
      }}
      data-testid={`requester-${pubkey.slice(0, 8)}`}
    >
      <Avatar className="h-6 w-6 shrink-0">
        {profile?.picture ? <AvatarImage src={profile.picture} alt={profile?.name || "User"} className="object-cover" /> : null}
        <AvatarFallback className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
          {profile?.name?.charAt(0)?.toUpperCase() || "?"}
        </AvatarFallback>
      </Avatar>
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="truncate max-w-[140px] font-medium">{profile?.name || label}</span>
        {profile?.name && (
          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[140px]">{label}</span>
        )}
      </span>
    </span>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const td = "px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200";

/** Lifecycle lines in the admin's voice; unknown event types render plainly. */
function adminEventLabel(e: { type: string; by: string }): string {
  if (e.type === "opened") return "Ticket opened";
  if (e.type === "closed") return e.by === "support" ? "Closed by support" : "Closed";
  if (e.type === "reopened") return e.by === "user" ? "Reopened by the user's reply" : "Reopened";
  if (e.type === "recategorized") return "Recategorized by support";
  return e.type.replaceAll("_", " ");
}

type SortKey = "subject" | "category" | "status" | "updated";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const TIME_WINDOWS = [
  { key: "all", label: "All time", ms: null },
  { key: "24h", label: "Last 24 hours", ms: 86_400_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
] as const;

function SortHeader({ label, sortKey, sort, onSort }: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      className="flex items-center gap-1 uppercase tracking-wide font-semibold hover:text-slate-800 dark:hover:text-slate-200 transition-colors whitespace-nowrap"
      onClick={() => onSort(sortKey)}
      data-testid={`sort-support-${sortKey}`}
    >
      {label}
      {active ? (
        sort!.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

/** Default order is the work queue: open first, newest activity first within.
 *  Exported for tests — jsdom can't open Radix selects, so the windowing
 *  behavior is verified here and the wiring visually. */
export function filterAndSort(
  tickets: AdminSupportTicket[],
  profiles: Map<string, ProfileBits>,
  search: string,
  statusFilter: string,
  categoryFilter: string,
  windowFilter: string,
  sort: SortState,
): AdminSupportTicket[] {
  const q = search.trim().toLowerCase();
  const windowMs = TIME_WINDOWS.find((w) => w.key === windowFilter)?.ms ?? null;
  const cutoff = windowMs === null ? null : Date.now() - windowMs;
  let out = tickets.filter((t) => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (cutoff !== null && new Date(t.lastMessageAt).getTime() < cutoff) return false;
    if (!q) return true;
    const name = (t.pubkey && profiles.get(t.pubkey)?.name?.toLowerCase()) || "";
    return (
      t.subject.toLowerCase().includes(q) ||
      requesterLabel(t.pubkey).toLowerCase().includes(q) ||
      name.includes(q)
    );
  });
  if (sort) {
    const value = (t: AdminSupportTicket): string => {
      switch (sort.key) {
        case "subject": return t.subject.toLowerCase();
        case "category": return categoryLabel(t.category).toLowerCase();
        case "status": return t.status;
        case "updated": return t.lastMessageAt;
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => value(a).localeCompare(value(b)) * dir);
  } else {
    const rank = (t: AdminSupportTicket) => (t.status === "open" ? 0 : t.status === "answered" ? 1 : 2);
    out = [...out].sort((a, b) => rank(a) - rank(b) || b.lastMessageAt.localeCompare(a.lastMessageAt));
  }
  return out;
}

/**
 * The admin side of priority support: every ticket, the thread, reply + close.
 * Same seam as the user page, so in mock mode this demos the full loop against
 * the browser-local store before the server exists.
 */
export function AdminSupportCards({ active }: { active: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortState>(null);
  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const listQuery = useQuery({
    queryKey: ADMIN_SUPPORT_KEY,
    queryFn: adminListTickets,
    enabled: active,
    staleTime: 30_000,
  });
  // Before the early returns — hook order must not change between renders.
  const profiles = useProfileBits((listQuery.data ?? []).map((t) => t.pubkey));

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

  const statuses = Array.from(new Set(tickets.map((t) => t.status))).sort();
  const categories = Array.from(new Set(tickets.map((t) => t.category))).sort();
  const visible = filterAndSort(tickets, profiles, search, statusFilter, categoryFilter, windowFilter, sort);
  const filtering =
    search.trim() !== "" || statusFilter !== "all" || categoryFilter !== "all" || windowFilter !== "all";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <input
            type="text"
            placeholder="Search subject, requester…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 pr-7 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/40"
            data-testid="input-support-search"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              data-testid="button-support-clear-search"
            >
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-support-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-40 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-support-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={windowFilter} onValueChange={setWindowFilter}>
          <SelectTrigger className="w-36 h-8 text-xs rounded-xl border-slate-200 dark:border-slate-800" data-testid="select-support-window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_WINDOWS.map((w) => (
              <SelectItem key={w.key} value={w.key}>{w.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtering && (
          <span className="text-xs text-slate-400 dark:text-slate-500" data-testid="support-filter-count">
            {visible.length} of {tickets.length}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-sm text-slate-500 dark:text-slate-400" data-testid="admin-support-no-match">
          No tickets match your filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]" data-testid="table-admin-support">
            <thead>
              <tr className="border-b border-brand-accent/10">
                <th className={th}><SortHeader label="Subject" sortKey="subject" sort={sort} onSort={toggleSort} /></th>
                <th className={th}><SortHeader label="Category" sortKey="category" sort={sort} onSort={toggleSort} /></th>
                <th className={th}>From</th>
                <th className={th}><SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} /></th>
                <th className={th}><SortHeader label="Updated" sortKey="updated" sort={sort} onSort={toggleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr
                  key={t.id}
                  className="cursor-pointer border-b border-brand-accent/5 hover:bg-slate-50 dark:hover:bg-slate-900/50"
                  onClick={() => setOpenId(t.id)}
                  data-testid={`admin-ticket-${t.id}`}
                >
                  <td className={`${td} font-medium`}>
                    <span className="flex items-center gap-2">
                      {isUnread("admin", t) && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-brand-accent"
                          aria-label="New message from user"
                          data-testid={`admin-unread-${t.id}`}
                        />
                      )}
                      {t.subject}
                    </span>
                  </td>
                  <td className={td}>{categoryLabel(t.category)}</td>
                  <td className={td}>
                    <RequesterCell
                      pubkey={t.pubkey}
                      profile={t.pubkey ? profiles.get(t.pubkey) : undefined}
                      onFilter={setSearch}
                    />
                  </td>
                  <td className={td}>
                    <span className="flex flex-col items-start gap-0.5">
                      <Chip tone={statusTone(t.status)} size="sm">{t.status}</Chip>
                      {t.closedAt && (
                        <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500" data-testid={`closed-at-${t.id}`}>
                          {fmtWhen(t.closedAt)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={`${td} tabular-nums`}>{fmtWhen(t.lastMessageAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdminThread({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingMessage, setClosingMessage] = useState(DEFAULT_CLOSING_MESSAGE);

  const threadQuery = useQuery({
    queryKey: [...ADMIN_SUPPORT_KEY, id],
    queryFn: () => fetchThread(id),
  });
  const ticket = threadQuery.data?.ticket;
  const messages = threadQuery.data?.messages ?? [];
  const events = threadQuery.data?.events ?? [];
  const closed = ticket?.status === "closed";

  const timeline = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.createdAt, message: m })),
    ...events.map((e) => ({ kind: "event" as const, at: e.at, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "event" ? -1 : 1));

  // Being here IS seeing it — clears the queue dot for this ticket.
  const lastMessageAt = ticket?.lastMessageAt;
  useEffect(() => {
    if (lastMessageAt) markSeen("admin", id);
  }, [id, lastMessageAt]);

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

  const close = async (message?: string) => {
    setBusy(true);
    try {
      await adminCloseTicket(id, message);
      setCloseOpen(false);
      await refresh();
      toast({
        title: "Ticket closed",
        description: message ? "Closing message sent — replying reopens it for them." : "Closed without a message.",
      });
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
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => { setClosingMessage(DEFAULT_CLOSING_MESSAGE); setCloseOpen(true); }}
            className="gap-1.5"
            data-testid="admin-close-ticket"
          >
            <CheckCircle2 className="h-4 w-4" /> Close ticket
          </Button>
        )}
      </div>

      {/* Confirm-with-a-final-word: the closing message is queued here,
          editable, and goes out only on the admin's press — never silently. */}
      <Dialog open={closeOpen} onOpenChange={(o) => !busy && setCloseOpen(o)}>
        <DialogContent className="sm:max-w-lg" data-testid="close-ticket-dialog">
          <DialogHeader>
            <DialogTitle>Close this ticket?</DialogTitle>
            <DialogDescription>
              The user keeps the history, and replying reopens it for them. You can send a closing
              message with it — edit it below, or close silently.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={closingMessage}
            onChange={(e) => setClosingMessage(e.target.value.slice(0, 4000))}
            rows={3}
            className="w-full resize-y rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            data-testid="close-message-input"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void close()} data-testid="close-silent">
              Close without message
            </Button>
            <Button disabled={busy || !closingMessage.trim()} onClick={() => void close(closingMessage)} data-testid="close-send">
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send &amp; close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {threadQuery.isPending || !ticket ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <h4 className="text-base font-bold" style={{ fontFamily: "var(--font-display)" }}>{ticket.subject}</h4>
            <Chip tone={statusTone(ticket.status)} size="sm" data-testid="admin-thread-status">{ticket.status}</Chip>
            {/* Recategorize in place: low-stakes, reversible, on the record. */}
            <select
              aria-label="Ticket category"
              className="h-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1.5 text-xs text-slate-600 dark:text-slate-300"
              value={SUPPORT_CATEGORIES.some((c) => c.key === ticket.category) ? ticket.category : ""}
              onChange={(e) => {
                const next = e.target.value;
                if (next) void adminSetCategory(id, next).then(refresh);
              }}
              data-testid="admin-category-select"
            >
              {!SUPPORT_CATEGORIES.some((c) => c.key === ticket.category) && (
                <option value="">{ticket.category || "uncategorized"}</option>
              )}
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 space-y-2.5">
            {timeline.map((item, i) =>
              item.kind === "message" ? (
                <div
                  key={item.message.id}
                  className={`max-w-[85%] rounded-xl border p-3 text-sm ${
                    item.message.author === "support"
                      ? "ml-auto border-brand-accent/25 bg-brand-primary/[0.05] dark:bg-brand-primary/10"
                      : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  }`}
                  data-testid={`admin-message-${item.message.author}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {item.message.author === "support" ? "Support (you)" : "User"}
                    <span className="ml-2 font-normal normal-case tracking-normal">{fmtWhen(item.message.createdAt)}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{item.message.body}</p>
                </div>
              ) : (
                <p
                  key={`ev-${i}`}
                  className="text-center text-[11px] text-slate-400 dark:text-slate-500"
                  data-testid={`admin-event-${item.event.type}`}
                >
                  — {adminEventLabel(item.event)} · {fmtWhen(item.event.at)} —
                </p>
              ),
            )}
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
