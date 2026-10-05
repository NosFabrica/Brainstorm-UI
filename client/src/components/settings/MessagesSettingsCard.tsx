/**
 * Settings › Trust & search › Private messages: where people send you
 * messages (kind 10050), who goes straight to Chats, and the default
 * disappearing timer for new chats.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, MessageCircle, Plus, Server, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SyncDetails } from "@/components/messages/SyncDetails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useDmEngine, useDmPrefs, useDmState } from "@/hooks/useDirectMessages";
import { ANSWER_WITHIN_MS, serverStatus, type ServerStatus } from "@/lib/dm/serverStatus";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Chip } from "@/components/ui/chip";
import { publishInboxRelays } from "@/services/dm";
import { FileServersSection } from "@/components/settings/FileServersSection";
import { MAX_INBOX_RELAYS, SUGGESTED_INBOX_RELAYS } from "@/lib/dm/inboxRelays";
import { TIMER_CHOICES, setNotifyPrefs, updateDmPrefs, type DmNotifyPrefs, type DmReach } from "@/lib/dm/prefs";
import { Switch } from "@/components/ui/switch";
import { playChime } from "@/lib/chime";
import { dedupeRelays } from "@/lib/relayRouting";
import { cn } from "@/lib/utils";
import { useDmRelays } from "@/hooks/useDmRelays";

const REACH: { value: DmReach; label: string; hint: string }[] = [
  { value: "follows", label: "People I follow", hint: "Everyone else waits in Requests." },
  { value: "trusted", label: "People I follow, and anyone verified", hint: "Verification Score 50 and up." },
  { value: "everyone", label: "Everyone", hint: "No requests at all. Flagged senders are still left out." },
];

const host = (url: string) => url.replace(/^wss?:\/\//, "").replace(/\/$/, "");

function permissionNow(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} data-testid={id} />
    </div>
  );
}

function NotificationSettings({ pubkey, notify }: { pubkey: string; notify: DmNotifyPrefs }) {
  const [permission, setPermission] = useState(permissionNow);
  const desktopOn = notify.desktop && permission === "granted";
  const setDesktop = async (on: boolean) => {
    if (!on) return setNotifyPrefs(pubkey, { desktop: false });
    if (permission === "unsupported") return;
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    setNotifyPrefs(pubkey, { desktop: result === "granted" });
  };
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          While Brainstorm is open in a tab. Muted chats, and requests below your trust threshold, stay quiet.
        </p>
      </div>
      <ToggleRow
        id="dm-notify-desktop"
        label="Browser notifications"
        hint={
          permission === "denied"
            ? "Blocked in your browser's site settings."
            : permission === "unsupported"
              ? "This browser doesn't offer them."
              : undefined
        }
        checked={desktopOn}
        disabled={permission === "denied" || permission === "unsupported"}
        onChange={(on) => void setDesktop(on)}
      />
      <ToggleRow
        id="dm-notify-preview"
        label="Show message text"
        hint="Off: only who wrote. Requests never show their text."
        checked={notify.preview}
        disabled={!desktopOn}
        onChange={(on) => setNotifyPrefs(pubkey, { preview: on })}
      />
      <ToggleRow
        id="dm-notify-sound"
        label="Sound"
        checked={notify.sound}
        onChange={(on) => {
          setNotifyPrefs(pubkey, { sound: on });
          if (on) playChime();
        }}
      />
    </section>
  );
}

const STATUS: Record<ServerStatus, { label: string; tone: "success" | "warning" | "slate" }> = {
  working: { label: "Working", tone: "success" },
  "not-answering": { label: "Not answering", tone: "warning" },
  "sign-in": { label: "Asks you to sign in", tone: "warning" },
  checking: { label: "Checking…", tone: "slate" },
};

/** A server's status in a reader's words; nothing while the list has unsaved changes. */
function ServerStatusChip({ status }: { status: ServerStatus | null }) {
  if (!status) return null;
  const s = STATUS[status];
  return (
    <Chip tone={s.tone} size="sm" className="shrink-0">
      {s.label}
    </Chip>
  );
}

export function MessagesSettingsCard() {
  const pubkey = useActiveAccountDisplay()?.pubkey ?? "";
  const prefs = useDmPrefs(pubkey || undefined);
  const { toast } = useToast();
  const current = useDmRelays(pubkey || null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [adding, setAdding] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Each server's status, from the inbox's own live state (lib/dm/serverStatus).
  const dmState = useDmState(useDmEngine());
  // How long this page has watched: a server still silent well after another answered
  // reads as not answering here, where nothing pages its history to find out.
  const [openedAt] = useState(() => Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => tick((n) => n + 1), ANSWER_WITHIN_MS + 500);
    return () => clearTimeout(t);
  }, []);
  const statusOf = (url: string) => serverStatus(url, dmState, { waitedMs: Date.now() - openedAt });
  const answering = current.relays.map((url) => statusOf(url));
  const serversAnswering: "all" | "some" | "none" | "unknown" = !answering.length
    ? "unknown"
    : answering.every((st) => st === "not-answering")
      ? "none"
      : answering.some((st) => st === "not-answering")
        ? "some"
        : "all";
  const [switchOpen, setSwitchOpen] = useState(false);
  const relays = draft ?? current.relays;
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

  const publish = async (list: string[] = relays) => {
    setBusy(true);
    const outcome = await publishInboxRelays(list);
    setBusy(false);
    if (outcome.cancelled) return;
    if (outcome.success) {
      setDraft(null);
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
            End-to-end encrypted (NIP-17). Relays can't see who you talk to or when — unless you sign in to someone's
            inbox relay to deliver to it.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 p-5 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Message servers <span className="font-normal text-slate-400">· inbox relays</span>
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Everyone who messages you sends to these, and only these. Pick one to {MAX_INBOX_RELAYS} that ask you to
              log in before handing out messages. Published as your kind 10050 list.
            </p>
          </div>
          {current.loading ? (
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking up your list…
            </span>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {relays.length === 0 && (
                <li className="px-3 py-2.5 text-xs text-slate-500">None yet — nobody can send you private messages.</li>
              )}
              {relays.map((url) => (
                <li key={url} className="flex items-center gap-2.5 px-3 py-2" data-testid={`dm-server-${host(url)}`}>
                  <Server className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={host(url)}>
                    {host(url)}
                  </span>
                  <ServerStatusChip status={dirty ? null : statusOf(url)} />
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
          {/* Senders deliver to every server on the list, so while one works nothing is lost:
              say so, and offer no swap — replacing a server stops reading messages that only it
              holds, for what is usually a passing outage. Only when none answer is there
              something to fix, and then it's the suggested set, explained first. */}
          {!dirty && serversAnswering === "some" && (
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="dm-servers-note">
              Messages still reach you through your other servers.
            </p>
          )}
          {!dirty && serversAnswering === "none" && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                None of your message servers are answering, so new messages can't reach you right now.
              </p>
              <Button size="sm" className="self-start" onClick={() => setSwitchOpen(true)}>
                Use suggested servers
              </Button>
            </div>
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
          <AlertDialog open={switchOpen} onOpenChange={setSwitchOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Switch to the suggested servers?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>New messages will go to {SUGGESTED_INBOX_RELAYS.map(host).join(" and ")}.</p>
                    <p>
                      Messages on your current servers won't load until you add them back. You can change this here any
                      time.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setDraft(SUGGESTED_INBOX_RELAYS);
                    void publish(SUGGESTED_INBOX_RELAYS);
                  }}
                >
                  Switch and publish
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
          <div className="mt-5 border-t border-border pt-5">
            <FileServersSection pubkey={pubkey} />
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

          <NotificationSettings pubkey={pubkey} notify={prefs.notify} />

          <section className="flex flex-col gap-3">
            <ToggleRow
              id="dm-link-previews"
              label="Link previews"
              hint="Fetched by Brainstorm's own server, which doesn't log them, and pictures through our image proxy — the linked site never sees you. Never for requests."
              checked={prefs.linkPreviews}
              onChange={(on) => updateDmPrefs(pubkey, (p) => ({ ...p, linkPreviews: on }))}
            />
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
      <div className="border-t border-border p-5">
        <SyncDetails />
      </div>
    </Card>
  );
}
