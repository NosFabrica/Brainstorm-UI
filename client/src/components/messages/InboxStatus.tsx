/**
 * The states between "signed in" and "reading messages": no inbox relays yet,
 * inbox relays that want a NIP-42 login, a signer that hasn't opened anything
 * (or said no), a signer that can't do NIP-44 at all.
 */
import { useState } from "react";
import { Inbox, KeyRound, Loader2, Lock, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { SectionHeader } from "@/components/ui/section-header";
import { useToast } from "@/hooks/use-toast";
import type { DmEngine, DmEngineState } from "@/services/dm/engine";
import { turnOnMessages } from "@/services/dm";
import { SUGGESTED_INBOX_RELAYS } from "@/lib/dm/inboxRelays";
import { ENCRYPTED_BLOSSOM_SERVERS } from "@/lib/blossomServers";
import { relayHost } from "./people";
import { isOwnRelay } from "@/services/relayAuth";

/** First visit: publish a kind-10050 before anything can arrive. */
export function InboxSetup() {
  const { toast } = useToast();
  const [chosen, setChosen] = useState<string[]>(SUGGESTED_INBOX_RELAYS);
  const [busy, setBusy] = useState(false);
  const publish = async () => {
    setBusy(true);
    const outcome = await turnOnMessages(chosen);
    setBusy(false);
    if (outcome.cancelled) return;
    if (!outcome.success)
      toast({ title: "Couldn't publish your inbox relays", description: outcome.error, variant: "destructive" });
  };
  return (
    <div className="flex flex-1 items-center justify-center p-6" data-testid="dm-setup">
      <Card className="flex w-full max-w-md flex-col gap-4 p-6">
        <SectionHeader kicker="Private messages" icon={Inbox} />
        <h2 className="font-display text-xl font-bold">Turn on private messages</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Tell people where to send you messages. Your messages are end-to-end encrypted: relays can't read them or see
          who sent them. Brainstorm signs you in to relays that ask for it.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Inbox relays</legend>
          {SUGGESTED_INBOX_RELAYS.map((url) => (
            <label key={url} className="flex items-center gap-2.5 font-mono text-[13px]">
              <input
                type="checkbox"
                checked={chosen.includes(url)}
                onChange={(e) => setChosen((cur) => (e.target.checked ? [...cur, url] : cur.filter((u) => u !== url)))}
                className="h-4 w-4 accent-[rgb(var(--brand-primary))]"
              />
              {relayHost(url)}
            </label>
          ))}
        </fieldset>
        <Button onClick={() => void publish()} disabled={!chosen.length || busy} data-testid="dm-setup-publish">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Turn on private messages
        </Button>
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Publishes your kind 10050 list and lets these relays sign you in. With no kind 10063 file server list yet,
          also publishes one ({ENCRYPTED_BLOSSOM_SERVERS.map((u) => u.replace(/^https?:\/\//, "")).join(", ")}) for the
          files you send. Change any of it in Settings › Trust & search.
        </p>
      </Card>
    </div>
  );
}

/**
 * Progress, not a problem: a slim line pinned under the list while wraps are
 * being opened — a count and how far along this visit is.
 */
export function OpeningStatus({ state }: { state: DmEngineState }) {
  if (state.paused || state.queued <= 0) return null;
  const done = state.sync.opened;
  const share = done + state.queued > 0 ? done / (done + state.queued) : 0;
  return (
    <div className="mx-4 mb-2 flex flex-col gap-1.5" role="status" data-testid="dm-notice-opening">
      <span className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        Opening {state.queued.toLocaleString()} message{state.queued === 1 ? "" : "s"}…
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <span
          className="block h-full rounded-full bg-brand-primary transition-[width] duration-500"
          style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
        />
      </span>
    </div>
  );
}

/** What waits on the reader — a login, an unlock, a signer that can't — pinned under the list. */
export function InboxNotices({
  engine,
  state,
  authAllowed,
  onAllowAuth,
}: {
  engine: DmEngine | null;
  state: DmEngineState;
  authAllowed: boolean;
  onAllowAuth: () => void;
}) {
  const notices: {
    key: string;
    icon: React.ReactNode;
    text: string;
    action?: React.ReactNode;
    variant?: "warning" | "default";
  }[] = [];
  // Your own relays sign you in by themselves (services/relayAuth); a recipient's asks first.
  if (!authAllowed && state.sendAuth.some((relay) => !isOwnRelay(relay)))
    notices.push({
      key: "auth",
      icon: <KeyRound className="h-4 w-4" />,
      text: "Some recipients' inbox relays only take your messages once you sign in to them. Unsent messages go out when you do.",
      action: (
        <Button size="sm" onClick={onAllowAuth} data-testid="dm-allow-auth">
          Allow sign-in
        </Button>
      ),
    });
  if (state.paused === "no-nip44")
    notices.push({
      key: "nip44",
      icon: <Plug className="h-4 w-4" />,
      text: "Your signer can't open private messages (it lacks NIP-44). Update it, or sign in with one that does.",
    });
  if (state.paused === "cancelled" || state.paused === "refused" || state.paused === "unreachable")
    notices.push({
      key: "paused",
      icon: <Lock className="h-4 w-4" />,
      text:
        state.paused === "cancelled"
          ? `Unlock to read ${state.queued} message${state.queued === 1 ? "" : "s"}.`
          : state.paused === "unreachable"
            ? "Your signer didn't answer, so new messages are still sealed."
            : "Your signer declined to open messages.",
      action: (
        <Button size="sm" variant="outline" onClick={() => engine?.allowDecrypt()}>
          {state.paused === "cancelled" ? "Unlock" : "Try again"}
        </Button>
      ),
    });
  if (!notices.length) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pb-2">
      {notices.map((n) => (
        <Alert
          key={n.key}
          variant={n.variant ?? "warning"}
          className="flex flex-col gap-2 rounded-xl px-3 py-2.5 text-[13px] leading-relaxed"
          data-testid={`dm-notice-${n.key}`}
        >
          <span className="flex gap-2">
            <span className="mt-0.5 shrink-0">{n.icon}</span>
            {n.text}
          </span>
          {n.action && <span className="pl-6">{n.action}</span>}
        </Alert>
      ))}
    </div>
  );
}
