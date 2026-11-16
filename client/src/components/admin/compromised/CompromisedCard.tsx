import { useState } from "react";
import { Link } from "wouter";
import { nip19 } from "nostr-tools";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient, type CompromisedPubkey } from "@/services/api";
import { useProfileBits } from "../useProfileBits";
import {
  EMPTY_FORM,
  buildMarkRequest,
  parseAccount,
  zeroState,
  zeroSummary,
  type MarkForm,
  type ZeroState,
} from "./compromisedForm";

export const COMPROMISED_KEY = ["/api/admin/compromised"];

const STATE_CHIP: Record<ZeroState, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  complete: { tone: "success", label: "Zeroed" },
  incomplete: { tone: "warning", label: "Incomplete" },
  failed: { tone: "danger", label: "Failed" },
  pending: { tone: "neutral", label: "Zeroing…" },
};

function npub(hex: string): string {
  try {
    return nip19.npubEncode(hex);
  } catch {
    return hex;
  }
}

function short(s: string): string {
  return s.length > 20 ? `${s.slice(0, 12)}…${s.slice(-6)}` : s;
}

function day(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** What the PUT's answer says the zeroing did, for a toast. */
function zeroToast(row: CompromisedPubkey | undefined): string {
  if (!row) return "Its scores are being zeroed.";
  return zeroState(row) === "pending"
    ? "Its scores are still being zeroed; this list shows when it lands."
    : zeroSummary(row);
}

/** The form that marks a new account. */
function MarkAccountForm({ onMarked }: { onMarked: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<MarkForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<MarkForm>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const req = buildMarkRequest(form);
    if (req.error !== undefined) {
      setError(req.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const row = await apiClient.markCompromised(req.pubkey, req.body);
      toast({ title: "Marked compromised", description: zeroToast(row) });
      setForm(EMPTY_FORM);
      onMarked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="form-mark-compromised">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="compromised-account">Compromised account</Label>
          <Input
            id="compromised-account"
            placeholder="npub1… or hex"
            value={form.account}
            onChange={(e) => set({ account: e.target.value })}
            data-testid="input-compromised-account"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="compromised-successor">Their new account (optional)</Label>
          <Input
            id="compromised-successor"
            placeholder="npub1… — can be added later"
            value={form.successor}
            onChange={(e) => set({ successor: e.target.value })}
            data-testid="input-compromised-successor"
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="compromised-proof">Proof of the compromise</Label>
          <button
            type="button"
            className="text-xs font-medium text-brand-link underline underline-offset-2"
            onClick={() => set({ proofMode: form.proofMode === "id" ? "json" : "id" })}
            data-testid="button-compromised-proof-mode"
          >
            {form.proofMode === "id" ? "Paste the signed event instead" : "Give its id instead"}
          </button>
        </div>
        {form.proofMode === "id" ? (
          <Input
            id="compromised-proof"
            placeholder="nevent1…, note1… or hex id: the server fetches it and keeps it whole"
            value={form.proofId}
            onChange={(e) => set({ proofId: e.target.value })}
            data-testid="input-compromised-proof-id"
          />
        ) : (
          <Textarea
            id="compromised-proof"
            rows={5}
            className="font-mono text-xs"
            placeholder='{"id": "…", "pubkey": "…", "sig": "…", …}: for when no relay the server asks still holds it'
            value={form.proofJson}
            onChange={(e) => set({ proofJson: e.target.value })}
            data-testid="input-compromised-proof-json"
          />
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="compromised-reason">Note (optional, admins only)</Label>
        <Input
          id="compromised-reason"
          placeholder="e.g. nsec leaked via a compromised build"
          value={form.reason}
          onChange={(e) => set({ reason: e.target.value })}
          data-testid="input-compromised-reason"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="error-mark-compromised">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} data-testid="button-mark-compromised">
        {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1 h-3.5 w-3.5" />}
        Mark compromised
      </Button>
    </form>
  );
}

/** Edit the successor and note of a marked account; the proof stays. */
function EditDialog({ row, onClose, onSaved }: { row: CompromisedPubkey; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [successor, setSuccessor] = useState(row.successor_pubkey ? npub(row.successor_pubkey) : "");
  const [reason, setReason] = useState(row.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const successorHex = successor.trim() ? parseAccount(successor) : null;
    if (successor.trim() && !successorHex) {
      setError("The new account must be an npub or a 64-character hex pubkey.");
      return;
    }
    if (successorHex === row.pubkey) {
      setError("The new account can't be the compromised one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.markCompromised(row.pubkey, {
        successor_pubkey: successorHex,
        reason: reason.trim() || null,
      });
      toast({ title: "Saved" });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {short(npub(row.pubkey))}</DialogTitle>
          <DialogDescription>
            The proof stays as stored. Saving zeroes its scores again, which takes a few seconds and is harmless.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="edit-successor">Their new account</Label>
            <Input
              id="edit-successor"
              placeholder="npub1… — empty clears it"
              value={successor}
              onChange={(e) => setSuccessor(e.target.value)}
              data-testid="input-edit-successor"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-reason">Note</Label>
            <Input id="edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save} data-testid="button-save-compromised">
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirm before unmarking: its own ratings, cut when marked, don't come back by themselves. */
function UnmarkDialog({ row, onClose, onDone }: { row: CompromisedPubkey; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unmark() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.unmarkCompromised(row.pubkey);
      toast({ title: "Unmarked", description: short(npub(row.pubkey)) });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unmark {short(npub(row.pubkey))}?</DialogTitle>
          <DialogDescription>
            Its runs and scores resume. Each Observer's rank-0 assertion stays until that Observer's next run that
            re-asserts it, and the follows, mutes, reports and designations cut when it was marked come back only as the
            key publishes them again.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy} onClick={unmark} data-testid="button-confirm-unmark">
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Unmark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompromisedRow({
  row,
  name,
  successorName,
  onEdit,
  onUnmark,
  onRezero,
  rezeroing,
}: {
  row: CompromisedPubkey;
  name?: string;
  successorName?: string;
  onEdit: () => void;
  onUnmark: () => void;
  onRezero: () => void;
  rezeroing: boolean;
}) {
  const [showProof, setShowProof] = useState(false);
  const state = zeroState(row);
  const chip = STATE_CHIP[state];
  const rowNpub = npub(row.pubkey);
  return (
    <Card className="p-4" data-testid={`compromised-row-${row.pubkey}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/p/${rowNpub}`}
              className="text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100"
            >
              {name || short(rowNpub)}
            </Link>
            <Chip tone={chip.tone} size="sm" data-testid={`compromised-state-${state}`}>
              {chip.label}
            </Chip>
          </div>
          <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{rowNpub}</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Marked {day(row.created_at)}
            {row.added_by ? ` by ${short(npub(row.added_by))}` : ""}
            {row.reason ? ` — ${row.reason}` : ""}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            New account:{" "}
            {row.successor_pubkey ? (
              <Link href={`/p/${npub(row.successor_pubkey)}`} className="text-brand-link underline underline-offset-2">
                {successorName || short(npub(row.successor_pubkey))}
              </Link>
            ) : (
              <span className="text-slate-400">not known yet</span>
            )}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="compromised-zero-summary">
            {zeroSummary(row)}
            {row.last_zeroed_at && state !== "pending" ? ` (${day(row.last_zeroed_at)})` : ""}
          </p>
          <button
            type="button"
            className="text-xs font-medium text-brand-link underline underline-offset-2"
            onClick={() => setShowProof((v) => !v)}
            aria-expanded={showProof}
          >
            {showProof ? "Hide the proof" : "Show the proof"}
          </button>
          {showProof && (
            <blockquote className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words border-l-2 border-slate-300 pl-2.5 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-300">
              {row.proof_event.content}
              <span className="mt-1 block font-mono text-[10px] text-slate-400">
                kind {row.proof_event.kind} · {short(row.proof_event.id)} · by {short(npub(row.proof_event.pubkey))}
              </span>
            </blockquote>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={onRezero}
            disabled={rezeroing}
            title="Zero its scores again, e.g. after a run that was publishing when it was marked"
            data-testid="button-rezero"
          >
            {rezeroing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            Zero again
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit} data-testid="button-edit-compromised">
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            onClick={onUnmark}
            data-testid="button-unmark"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Unmark
          </Button>
        </div>
      </div>
    </Card>
  );
}

/**
 * Admin: accounts whose key is compromised (brainstorm_server
 * `/admin/compromised`). Marking one zeroes its scores everywhere in the
 * background; each row says how that went and refreshes while it's running.
 */
export function CompromisedCard({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CompromisedPubkey | null>(null);
  const [unmarking, setUnmarking] = useState<CompromisedPubkey | null>(null);
  const [rezeroing, setRezeroing] = useState<string | null>(null);

  const query = useQuery({
    queryKey: COMPROMISED_KEY,
    queryFn: () => apiClient.listCompromised(),
    enabled: active,
    // Poll only while a zeroing is still landing.
    refetchInterval: (q) => (q.state.data?.some((r) => zeroState(r) === "pending") ? 4000 : false),
  });
  const rows = query.data ?? [];
  const profiles = useProfileBits(rows.flatMap((r) => [r.pubkey, r.successor_pubkey]));
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: COMPROMISED_KEY }),
      // The profile warning's cached answer (CompromisedBanner), so a profile
      // opened next shows the change rather than what it read before.
      queryClient.invalidateQueries({ queryKey: ["compromised"] }),
    ]);

  async function rezero(row: CompromisedPubkey) {
    setRezeroing(row.pubkey);
    try {
      const updated = await apiClient.markCompromised(row.pubkey, {});
      await refresh();
      toast({ title: "Zeroed again", description: zeroToast(updated) });
    } catch (err) {
      toast({
        title: "Couldn't zero again",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRezeroing(null);
    }
  }

  return (
    <div data-testid="card-compromised">
      <div className="border-b border-brand-accent/10 px-5 py-4">
        <h3
          className="text-sm font-bold text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Compromised Keys
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Accounts whose private key leaked. Marking one re-signs every Observer's Trusted Assertion about it at rank 0
          before answering; from then on nothing it follows, mutes, reports or designates counts, its own GrapeRank runs
          stop, and profiles show a warning.
        </p>
      </div>

      <div className="space-y-6 px-5 py-4">
        <MarkAccountForm onMarked={refresh} />

        <div className="space-y-2">
          {query.isLoading && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          )}
          {query.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {query.error instanceof Error ? query.error.message : "Failed to load compromised accounts"}
            </p>
          )}
          {query.isSuccess && rows.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="compromised-empty">
              No account is marked compromised.
            </p>
          )}
          {rows.map((row) => (
            <CompromisedRow
              key={row.pubkey}
              row={row}
              name={profiles.get(row.pubkey)?.name}
              successorName={row.successor_pubkey ? profiles.get(row.successor_pubkey)?.name : undefined}
              onEdit={() => setEditing(row)}
              onUnmark={() => setUnmarking(row)}
              onRezero={() => rezero(row)}
              rezeroing={rezeroing === row.pubkey}
            />
          ))}
        </div>
      </div>

      {editing && <EditDialog row={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {unmarking && <UnmarkDialog row={unmarking} onClose={() => setUnmarking(null)} onDone={refresh} />}
    </div>
  );
}
