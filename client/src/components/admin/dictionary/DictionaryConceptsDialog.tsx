/**
 * Admin → Users → ⋯ → Add dictionary concepts…: has a user's Brainstorm
 * Assistant author its copies of the concepts the app offers
 * (config/dictionary), and shows which they already hold. The copies are
 * signed server-side with the user's assistant key
 * (docs/dictionary/ADMIN-ASKS.md); what they hold is read from the relay, as
 * their own Settings › Dictionary reads it.
 *
 * Confirm-first like Trusted Lists, but in one dialog: the summary is the
 * thing to look at before pressing, and the result lands where the summary
 * was. Idempotent server-side, so a second press only reports "unchanged".
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Tone } from "@/lib/tones";
import { DICTIONARY_CONCEPTS } from "@/config/dictionary";
import { parseCoordinate } from "@/lib/dlistFields";
import {
  apiClient,
  DictionaryUnavailableError,
  type DictionaryConceptResult,
  type DictionaryRunData,
} from "@/services/api";
import type { DictionaryEntry } from "@/services/dictionary";
import { userDictionaryKey, useUserDictionary } from "./useUserDictionary";

const RESULT: Record<DictionaryConceptResult["status"], { label: string; tone: Tone }> = {
  published: { label: "Added", tone: "success" },
  updated: { label: "Updated", tone: "success" },
  unchanged: { label: "Already there", tone: "slate" },
  conflict: { label: "Conflict", tone: "warning" },
  not_found: { label: "Concept not found", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
};

/** "GitHub Accounts", else the coordinate's d. */
function conceptName(coordinate: string, entries: DictionaryEntry[] | undefined): string {
  const entry = entries?.find((e) => e.communityCoordinate === coordinate);
  return entry?.resolved?.governing.plural || parseCoordinate(coordinate)?.d || coordinate;
}

function HeldChip({ entry }: { entry: DictionaryEntry | undefined }) {
  if (!entry?.resolved) return <Chip tone="warning">Concept not found</Chip>;
  if (entry.resolved.source === "assistant") return <Chip tone="brand">Added by their Assistant</Chip>;
  if (entry.resolved.source === "personal") return <Chip tone="brand">Their own copy</Chip>;
  return <Chip tone="slate">Not yet</Chip>;
}

export function DictionaryConceptsDialog({
  pubkey,
  taPubkey,
  name,
  open,
  onOpenChange,
}: {
  pubkey: string;
  taPubkey: string | null;
  /** How to name the user in the title. */
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const summary = useUserDictionary(pubkey, taPubkey, open);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DictionaryRunData | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const data = await apiClient.publishDictionaryConcepts(pubkey, DICTIONARY_CONCEPTS);
      setResult(data);
      // The copies now exist (or don't): read the relay again rather than guess.
      await queryClient.invalidateQueries({ queryKey: userDictionaryKey(pubkey, taPubkey) });
    } catch (e) {
      setError({
        message: e instanceof Error ? e.message : String(e),
        retryable: !(e instanceof DictionaryUnavailableError),
      });
    } finally {
      setRunning(false);
    }
  };

  const close = (next: boolean) => {
    if (running) return; // the server is mid-publish; closing would hide the answer
    if (!next) {
      setResult(null);
      setError(null);
    }
    onOpenChange(next);
  };

  const entries = summary.data?.entries;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md" data-testid="dictionary-concepts-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-brand-deep" /> {name}'s Dictionary
          </DialogTitle>
          <DialogDescription>
            Their Brainstorm Assistant signs a copy of each concept, pointing at the community's, so it shows in their
            Dictionary. Concepts they already hold are left as they are.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border rounded-xl border border-border" data-testid="dictionary-concepts-list">
          {DICTIONARY_CONCEPTS.map((coordinate) => {
            const entry = entries?.find((e) => e.communityCoordinate === coordinate);
            const outcome = result?.concepts.find((c) => c.community === coordinate);
            return (
              <li key={coordinate} className="space-y-1 px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {conceptName(coordinate, entries)}
                  </span>
                  {outcome ? (
                    <Chip tone={RESULT[outcome.status].tone} data-testid="dictionary-concept-result">
                      {RESULT[outcome.status].label}
                    </Chip>
                  ) : summary.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <HeldChip entry={entry} />
                  )}
                </div>
                {outcome?.error && <p className="text-xs text-slate-500 dark:text-slate-400">{outcome.error}</p>}
              </li>
            );
          })}
        </ul>
        {!taPubkey && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            They have no Assistant yet. The server makes one when it signs.
          </p>
        )}
        {result?.relay && (
          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="dictionary-concepts-relay">
            Published to {result.relay}.
          </p>
        )}

        {error && (
          <Alert variant="destructive" data-testid="dictionary-concepts-error">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{error.message}</span>
              {error.retryable && (
                <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={running}>
                  Try again
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={running}>
            {result ? "Done" : "Cancel"}
          </Button>
          {!result && (
            <Button
              onClick={() => void run()}
              disabled={running || !DICTIONARY_CONCEPTS.length}
              data-testid="dictionary-concepts-run"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                "Add concepts"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
