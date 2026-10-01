/**
 * Settings › Trust & search › Private messages: where people send you
 * messages (kind 10050), who goes straight to Chats, and the default
 * disappearing timer for new chats.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MessageCircle, Plus, Server, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useDmPrefs } from "@/hooks/useDirectMessages";
import { publishInboxRelays } from "@/services/dm";
import { MAX_INBOX_RELAYS, SUGGESTED_INBOX_RELAYS, loadDmRelays } from "@/lib/dm/inboxRelays";
import { TIMER_CHOICES, updateDmPrefs, type DmReach } from "@/lib/dm/prefs";
import { dedupeRelays } from "@/lib/relayRouting";
import { cn } from "@/lib/utils";

const REACH: { value: DmReach; label: string; hint: string }[] = [
  { value: "follows", label: "People I follow", hint: "Everyone else waits in Requests." },
  { value: "trusted", label: "People I follow, and anyone verified", hint: "Verification Score 50 and up." },
  { value: "everyone", label: "Everyone", hint: "No requests at all. Flagged senders are still left out." },
];

const host = (url: string) => url.replace(/^wss?:\/\//, "").replace(/\/$/, "");

export function MessagesSettingsCard() {
  const pubkey = useActiveAccountDisplay()?.pubkey ?? "";
  const prefs = useDmPrefs(pubkey || undefined);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const current = useQuery({
    queryKey: ["dm-inbox", pubkey],
    queryFn: () => loadDmRelays(pubkey),
    enabled: !!pubkey,
    staleTime: 5 * 60_000,
  });
  const [draft, setDraft] = useState<string[] | null>(null);
  const [adding, setAdding] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const relays = draft ?? current.data?.relays ?? [];
  const dirty = draft !== null;
  useEffect(() => setDraft(null), [pubkey]);

  const add = () => {
    const raw = adding.trim();
    const url = /^wss?:\/\//i.test(raw) ? raw : `wss://${raw}`;
    const [normal] = dedupeRelays([url]);
    if (!normal) {
      setAddError("That isn't a relay address (wss://…).");
      return;
    }
    setAddError(null);
    setDraft(dedupeRelays([...relays, normal]));
    setAdding("");
  };

  const publish = async () => {
    setBusy(true);
    const outcome = await publishInboxRelays(relays);
    setBusy(false);
    if (outcome.cancelled) return;
    if (outcome.success) {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ["dm-inbox", pubkey] });
      toast({ title: "Inbox relays published" });
    } else {
      toast({ title: "Couldn't publish your inbox relays", description: outcome.error, variant: "destructive" });
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="card-messages-settings" id="messages-section">
      <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <MessageCircle className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Private messages
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            End-to-end encrypted (NIP-17). Relays can't see who you talk to or when.
          </p>
        </div>
      </div>

      <div className="grid gap-8 p-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Inbox relays</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Everyone who messages you sends to these, and only these. Pick one to {MAX_INBOX_RELAYS} that ask you to
              log in before handing out messages. Published as your kind 10050 list.
            </p>
          </div>
          {current.isPending ? (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up your list…
            </span>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {relays.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-slate-500">None yet — nobody can send you private messages.</li>
              )}
              {relays.map((url) => (
                <li key={url} className="flex items-center gap-2.5 px-3 py-2">
                  <Server className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{host(url)}</span>
                  <button
                    type="button"
                    onClick={() => setDraft(relays.filter((r) => r !== url))}
                    aria-label={`Remove ${host(url)}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Input
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="wss://"
              aria-label="Relay address"
              className="font-mono text-xs"
            />
            <Button type="submit" variant="outline" disabled={!adding.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </form>
          {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
          {relays.length > MAX_INBOX_RELAYS && (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Senders use the first {MAX_INBOX_RELAYS}. Fewer relays also means fewer places your metadata sits.
            </p>
          )}
          {!relays.length && !dirty && (
            <button
              type="button"
              onClick={() => setDraft(SUGGESTED_INBOX_RELAYS)}
              className="self-start text-xs font-semibold text-brand-link hover:underline"
            >
              Use suggested relays
            </button>
          )}
          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-slate-500">Unsaved changes</span>}
            <Button
              className="ml-auto"
              onClick={() => void publish()}
              disabled={!dirty || !relays.length || busy}
              data-testid="button-publish-inbox-relays"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publish relay list
            </Button>
          </div>
        </section>

        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Who goes straight to Chats</h3>
            <RadioGroup
              value={prefs.reach}
              onValueChange={(v) => updateDmPrefs(pubkey, (p) => ({ ...p, reach: v as DmReach }))}
              className="gap-2"
            >
              {REACH.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5",
                    prefs.reach === r.value ? "border-brand-primary/50 bg-brand-primary/[0.05]" : "border-border",
                  )}
                >
                  <RadioGroupItem value={r.value} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{r.hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Senders flagged by people you trust never reach your inbox, whatever this is set to.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Disappearing messages</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                The default for new chats (NIP-40). Relays that honour it delete the message after this time; the people
                you write to can still keep a copy.
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Default timer"
              className="grid grid-cols-4 gap-1 rounded-full bg-slate-100 p-1 dark:bg-slate-800"
            >
              {TIMER_CHOICES.map((c) => (
                <button
                  key={c.seconds}
                  type="button"
                  role="radio"
                  aria-checked={prefs.defaultTimer === c.seconds}
                  onClick={() => updateDmPrefs(pubkey, (p) => ({ ...p, defaultTimer: c.seconds }))}
                  className={cn(
                    "h-9 rounded-full text-sm font-semibold transition-colors",
                    prefs.defaultTimer === c.seconds
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Card>
  );
}
