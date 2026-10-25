/**
 * The /setup checklist's optional step: private messages, turned on in place
 * with one signature. Not one of the counted steps — nothing nags about it;
 * the account menu's Account setup row only counts it, muted — but it is where
 * a new account first meets messaging. It sits under its own "Optional"
 * heading below the counted steps, so their count plainly leaves it out.
 */
import { type ReactNode, useState } from "react";
import { Link } from "wouter";
import { Check, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { useToast } from "@/hooks/use-toast";
import { useDmEngine, useDmState } from "@/hooks/useDirectMessages";
import { SUGGESTED_INBOX_RELAYS } from "@/lib/dm/inboxRelays";
import { turnOnMessages } from "@/services/dm";
import { relayHost } from "./people";

/** Rendered with the row, so the heading never shows over nothing. */
function OptionalGroup({ children }: { children: ReactNode }) {
  return (
    <section className="mt-8" data-testid="setup-optional">
      <SectionHeader kicker="Optional" className="mb-3" />
      {children}
    </section>
  );
}

export function MessagesSetupRow() {
  const engine = useDmEngine();
  const state = useDmState(engine);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!engine || state.status === "starting" || state.status === "stopped") return null;

  if (state.status === "ready")
    return (
      <OptionalGroup>
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
      </OptionalGroup>
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
    <OptionalGroup>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-3.5" data-testid="setup-row-messages">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand-primary bg-brand-primary/10">
          <MessageCircle className="h-3.5 w-3.5 text-brand-primary dark:text-brand-link" />
        </span>
        <span className="min-w-0 flex-1">
          {/* No "Optional" chip: the heading above says it. */}
          <span className="block text-[15px] font-bold text-slate-900 dark:text-slate-100">
            Turn on private messages
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            End-to-end encrypted chats with anyone on Nostr, sorted by your web of trust. One signature tells people
            where to reach you.
          </span>
        </span>
        <Button size="sm" onClick={() => void turnOn()} disabled={busy} data-testid="setup-messages-turn-on">
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Turn on
        </Button>
      </Card>
    </OptionalGroup>
  );
}
