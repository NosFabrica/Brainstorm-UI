/**
 * Settings › Assistants › AI model › Your Assistant: which AI keys the reader's Brainstorm
 * Assistant holds beside their own, and moving one between them (quartz
 * `plans/2026-11-11-observer-site.md`, "The Assistant as runner"). The Assistant prints
 * the reader's Observer when no device of theirs is on, with its own keys, never the
 * reader's: "Give to Assistant" copies one of theirs to it; "Take back" copies it into
 * their own list and removes it from the Assistant's.
 *
 * Only a provider and a key's last four characters are ever shown. What is decrypted
 * stays in memory (`useAssistantAgentKeys`).
 */
import { useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeftRight, Bot, KeyRound, Loader2, Lock, RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ToastAction } from "@/components/ui/toast";
import { Chip } from "@/components/ui/chip";
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
import { useToast } from "@/hooks/use-toast";
import type { AssistantKeys } from "@/hooks/useAssistantAgentKeys";
import type { AgentKeysState } from "@/hooks/useAgentKeys";
import { providerName, type AgentKey } from "@/lib/agentKeys";
import {
  HOLDER_LABELS,
  compareKeys,
  keyName,
  keySuffix,
  withKeyCopied,
  withKeyGiven,
  withKeyRemoved,
  withKeyTaken,
  type HeldKey,
  type KeyHolder,
} from "@/lib/assistantKeys";
import { editAssistantKeys, type AssistantKeysEdit, type KnownList } from "@/services/assistantAgentKeys";
import { updateAgentKeys } from "@/services/agentKeys";
import { activeAccount } from "@/accounts/signing";
import { cn } from "@/lib/utils";

/** Where the app sets up the reader's web of trust, which mints their Assistant. */
const SETUP = "/setup";

const HOLDER_TONES: Record<KeyHolder, "brand" | "slate" | "accent"> = {
  both: "brand",
  mine: "slate",
  assistant: "accent",
};

/** An edit's failure in words; null when there is nothing to say (they dismissed the unlock). */
export function editProblem(outcome: Exclude<AssistantKeysEdit, { status: "ok" }>): string | null {
  switch (outcome.status) {
    case "cancelled":
      return null;
    case "no-assistant":
      return "You don't have an Assistant yet.";
    case "unavailable":
      return "Brainstorm can't hand keys to your Assistant yet.";
    case "relays":
      return "Your Assistant's relays didn't answer. Try again.";
    case "busy":
      return "Brainstorm couldn't save your Assistant's keys just now. Try again.";
    case "conflict":
      return "Your Assistant's keys changed while this was saving. Try again.";
    case "error":
      return outcome.message;
  }
}

export interface GiveResult {
  ok: boolean;
  /** What to tell the reader when it didn't all go through; null for nothing. */
  problem: string | null;
  /** Trying again may work (the relays, the server's lock, an edit landing meanwhile): offer Retry. */
  retry?: boolean;
}

/** What the server may answer differently in a moment. */
const RETRYABLE: ReadonlySet<AssistantKeysEdit["status"]> = new Set(["relays", "busy", "conflict"]);

type OnWrote = (assistant: string, tags: string[][], createdAt: number | null, id: string | null) => void;

/**
 * Give `key` to the Assistant: its list read, the key added, the whole list encrypted to
 * it and posted (`editAssistantKeys`, which retries a 409 once). Then, when asked, the key
 * leaves the reader's own list, only once the Assistant has it.
 */
export async function giveToAssistant(
  key: AgentKey,
  { removeFromMine }: { removeFromMine: boolean },
  onWrote: OnWrote,
  known?: KnownList,
): Promise<GiveResult> {
  const account = activeAccount();
  if (!account) return { ok: false, problem: "Not signed in." };
  const given = await editAssistantKeys(account, (tags) => withKeyGiven(tags, key), known);
  if (given.status !== "ok") return { ok: false, problem: editProblem(given), retry: RETRYABLE.has(given.status) };
  onWrote(given.assistant, given.tags, given.createdAt, given.id);
  if (!removeFromMine) return { ok: true, problem: null };
  const removed = await updateAgentKeys((mine) => withKeyRemoved(mine, key));
  if (removed.success) return { ok: true, problem: null };
  return {
    ok: true,
    problem: removed.cancelled
      ? null
      : `Your Assistant has it, but it's still in your keys${removed.error ? `: ${removed.error}` : "."}`,
  };
}

/**
 * Take `key` back: copied into the reader's own list first (the existing editor's
 * read-modify-write), and only once that is saved, removed from the Assistant's. A key
 * that couldn't be saved to theirs stays where it was.
 */
export async function takeBackFromAssistant(key: AgentKey, onWrote: OnWrote, known?: KnownList): Promise<GiveResult> {
  const account = activeAccount();
  if (!account) return { ok: false, problem: "Not signed in." };
  const copied = await updateAgentKeys((mine) => withKeyCopied(mine, key));
  if (!copied.success) {
    return { ok: false, problem: copied.cancelled ? null : (copied.error ?? "Couldn't save it to your keys.") };
  }
  const taken = await editAssistantKeys(account, (tags) => withKeyTaken(tags, key), known);
  if (taken.status !== "ok") {
    const why = editProblem(taken);
    return {
      ok: false,
      problem: why ? `It's in your keys now, but your Assistant still has it. ${why}` : null,
      retry: RETRYABLE.has(taken.status),
    };
  }
  onWrote(taken.assistant, taken.tags, taken.createdAt, taken.id);
  return { ok: true, problem: null };
}

function Row({
  held,
  busy,
  onGive,
  onTakeBack,
}: {
  held: HeldKey;
  busy: boolean;
  onGive: () => void;
  onTakeBack: () => void;
}) {
  const { key, holder } = held;
  const suffix = keySuffix(key);
  return (
    <li
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card p-3"
      data-testid="ai-model-assistant-row"
      data-holder={holder}
    >
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground"
      >
        <KeyRound className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{providerName(key.url)}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {suffix ? `····${suffix}` : "no key"}
          </span>
        </div>
        <Chip tone={HOLDER_TONES[holder]} size="sm" className="mt-1" data-testid="ai-model-assistant-holder">
          {HOLDER_LABELS[holder]}
        </Chip>
      </div>
      {holder === "mine" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onGive}
          className="w-full sm:w-auto"
          data-testid="ai-model-assistant-give"
        >
          <ArrowLeftRight /> Give to Assistant
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onTakeBack}
          className="w-full sm:w-auto"
          data-testid="ai-model-assistant-take-back"
        >
          <Undo2 /> Take back
        </Button>
      )}
    </li>
  );
}

/**
 * The section itself: the state of the Assistant's list, the two lists side by side as
 * one labelled list, and the note on what taking a key back can't undo.
 */
export function AssistantKeys({ mine, assistant }: { mine: AgentKeysState; assistant: AssistantKeys }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [giving, setGiving] = useState<AgentKey | null>(null);
  const [removeFromMine, setRemoveFromMine] = useState(false);
  const [taking, setTaking] = useState<AgentKey | null>(null);

  const myKeys = mine.status === "ready" ? mine.keys : mine.status === "none" ? [] : null;
  const rows = assistant.status === "ready" && myKeys ? compareKeys(myKeys, assistant.keys) : null;

  // The list as this screen last read or wrote it: an edit builds on it when the server's
  // read still has the version before (`editAssistantKeys`).
  const known: KnownList | undefined =
    assistant.status === "ready"
      ? { assistant: assistant.assistant, tags: assistant.tags, id: assistant.id, createdAt: assistant.createdAt }
      : undefined;
  const run = async (work: () => Promise<GiveResult>, done: string): Promise<void> => {
    setBusy(true);
    try {
      const result = await work();
      if (result.ok && !result.problem) toast({ title: done });
      else if (result.problem) {
        toast({
          title: result.ok ? done : "Couldn't save",
          description: result.problem,
          variant: result.ok ? undefined : "destructive",
          action: result.retry ? (
            <ToastAction
              altText="Try again"
              onClick={() => void run(work, done)}
              data-testid="ai-model-assistant-retry"
            >
              Retry
            </ToastAction>
          ) : undefined,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2" data-testid="ai-model-assistant">
      <div className="flex items-center gap-2 px-1">
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Your Assistant</h3>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        It prints your Observer when your devices are off, with keys you give it.
      </p>
      <AssistantState state={assistant} mineReady={!!myKeys} />
      {rows && rows.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground" data-testid="ai-model-assistant-empty">
          Neither of you has a key yet.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="ai-model-assistant-keys">
          {rows.map((held, i) => (
            <Row
              // Never the key itself, even as a React key.
              key={`${i}|${held.key.url}|${keySuffix(held.key)}|${held.holder}`}
              held={held}
              busy={busy}
              onGive={() => {
                setRemoveFromMine(false);
                setGiving(held.key);
              }}
              onTakeBack={() => setTaking(held.key)}
            />
          ))}
        </ul>
      )}
      {assistant.status === "ready" && (
        <p
          className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground"
          data-testid="ai-model-assistant-note"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <span>
            Taking a key back doesn&apos;t erase copies Brainstorm&apos;s server already holds: revoke it at the
            provider to be sure. Better, give your Assistant its own key with a spending limit.
          </span>
        </p>
      )}

      <AlertDialog open={!!giving} onOpenChange={(open) => !open && setGiving(null)}>
        <AlertDialogContent data-testid="ai-model-assistant-give-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Give {giving ? keyName(giving) : "this key"} to your Assistant?</AlertDialogTitle>
            <AlertDialogDescription>
              It prints your Observer with it, billed to this key. Use one with a spending limit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={removeFromMine}
              onCheckedChange={(v) => setRemoveFromMine(v === true)}
              data-testid="ai-model-assistant-remove-mine"
            />
            And remove it from mine
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const key = giving;
                const remove = removeFromMine;
                setGiving(null);
                if (key)
                  void run(() => giveToAssistant(key, { removeFromMine: remove }, assistant.wrote, known), "Given");
              }}
              data-testid="ai-model-assistant-give-confirm"
            >
              Give
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!taking} onOpenChange={(open) => !open && setTaking(null)}>
        <AlertDialogContent data-testid="ai-model-assistant-take-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Take back {taking ? keyName(taking) : "this key"}?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes into your keys, and your Assistant stops printing with it. Copies the server already holds
              aren&apos;t erased: revoke it at the provider to be sure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const key = taking;
                setTaking(null);
                if (key) void run(() => takeBackFromAssistant(key, assistant.wrote, known), "Taken back");
              }}
              data-testid="ai-model-assistant-take-confirm"
            >
              Take back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AssistantState({ state, mineReady }: { state: AssistantKeys; mineReady: boolean }) {
  const line = (testId: string, children: React.ReactNode, action?: React.ReactNode, tone?: "warn") => (
    <Card className="flex flex-wrap items-center gap-3 p-3" data-testid={testId}>
      {tone === "warn" ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      ) : null}
      <span className="min-w-0 flex-1 text-sm text-foreground">{children}</span>
      {action}
    </Card>
  );
  switch (state.status) {
    case "loading":
      return (
        <p
          className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
          data-testid="ai-model-assistant-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Looking for your Assistant&apos;s keys…
        </p>
      );
    case "no-assistant":
      return line(
        "ai-model-assistant-none",
        "You don't have an Assistant yet. Setting up your web of trust makes one.",
        <Button asChild size="sm" variant="outline">
          <Link href={SETUP} data-testid="ai-model-assistant-setup">
            Set up
          </Link>
        </Button>,
      );
    case "unavailable":
      return line("ai-model-assistant-unavailable", "Giving keys to your Assistant isn't available yet.");
    case "relays":
      return line(
        "ai-model-assistant-relays",
        "Your Assistant's relays didn't answer.",
        <RetryButton onClick={state.reload} />,
        "warn",
      );
    case "busy":
      return line(
        "ai-model-assistant-busy",
        "Brainstorm couldn't get your Assistant's keys just now.",
        <RetryButton onClick={state.reload} />,
        "warn",
      );
    case "error":
      return line("ai-model-assistant-error", state.message, <RetryButton onClick={state.reload} />, "warn");
    case "locked":
      return line(
        "ai-model-assistant-locked",
        <span className="inline-flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" aria-hidden /> Your Assistant&apos;s keys are encrypted to
          you.
        </span>,
        <Button size="sm" variant="outline" onClick={state.reveal} data-testid="ai-model-assistant-unlock">
          Unlock
        </Button>,
      );
    case "failed":
      return line("ai-model-assistant-failed", state.error, <RetryButton onClick={state.reveal} />, "warn");
    case "unreadable":
      return line(
        "ai-model-assistant-unreadable",
        "This sign-in can't decrypt your Assistant's keys.",
        undefined,
        "warn",
      );
    case "ready":
      return mineReady ? null : (
        <p className={cn("px-1 text-xs text-muted-foreground")} data-testid="ai-model-assistant-wait-mine">
          Unlock your keys above to compare them with your Assistant&apos;s.
        </p>
      );
  }
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} data-testid="ai-model-assistant-retry">
      <RotateCcw /> Retry
    </Button>
  );
}
