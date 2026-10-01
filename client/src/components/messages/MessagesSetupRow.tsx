/**
 * The /setup checklist's optional step: private messages, turned on in place
 * with one signature. Not one of the counted steps — nothing nags about it —
 * but it is where a new account first meets messaging.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import { useDmEngine, useDmState } from "@/hooks/useDirectMessages";
import { SUGGESTED_INBOX_RELAYS } from "@/lib/dm/inboxRelays";
import { turnOnMessages } from "@/services/dm";
import { relayHost } from "./people";

export function MessagesSetupRow() {
  const engine = useDmEngine();
  const state = useDmState(engine);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!engine || state.status === "starting" || state.status === "stopped") return null;

  if (state.status === "ready")
    return (
      <Card className="flex items-start gap-3.5 p-4" data-testid="setup-row-messages-done">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check className="h-4 w-4 text-white" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-slate-400 dark:text-slate-500">
            Turn on private messages
          </span>
          <span className="mt-0.5 block text-[13px] text-slate-400 dark:text-slate-500">
            Your inbox: {state.inboxRelays.map(relayHost).join(", ")} ·{" "}
            <Link href="/messages" className="font-semibold text-brand-link hover:underline">
              Open Messages
            </Link>
          </span>
        </span>
      </Card>
    );

  const turnOn = async () => {
    setBusy(true);
    const outcome = await turnOnMessages(SUGGESTED_INBOX_RELAYS);
    setBusy(false);
    if (outcome.cancelled) return;
    if (outcome.success) toast({ title: "Private messages are on" });
    else toast({ title: "Couldn't turn on private messages", description: outcome.error, variant: "destructive" });
  };

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-3.5" data-testid="setup-row-messages">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary bg-brand-primary/10">
        <MessageCircle className="h-3.5 w-3.5 text-brand-primary dark:text-brand-link" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-slate-900 dark:text-slate-100">Turn on private messages</span>
          <Chip tone="slate" size="sm" className="uppercase tracking-wide">
            Optional
          </Chip>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
          End-to-end encrypted chats with anyone on Nostr, sorted by your web of trust. One signature tells people where
          to reach you.
        </span>
      </span>
      <Button size="sm" onClick={() => void turnOn()} disabled={busy} data-testid="setup-messages-turn-on">
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Turn on
      </Button>
    </Card>
  );
}
