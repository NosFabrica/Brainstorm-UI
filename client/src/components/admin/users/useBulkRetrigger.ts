import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

/** Where a bulk re-trigger was started: a table's selection, or its last run's "Retry failed only". */
export type BulkSource = "users" | "activity";
export type BulkStatus = "queued" | "running" | "success" | "failed";
export type BulkResult = {
  source: BulkSource;
  successes: string[];
  failures: { pubkey: string; error: string }[];
};
/** A run waiting for the admin's confirmation. */
export type BulkRequest = { pubkeys: string[]; source: BulkSource | "retry" };

const CONCURRENCY = 5;

/**
 * A GrapeRank re-trigger for many people at once, five requests at a time,
 * shared by the Users and Activity tables: the run asked for (`pending`, until
 * confirmed), each person's status while it goes, and the last run's result.
 *
 * It claims its people from the same in-flight set as the single triggers
 * (useInFlightTriggers), before anything is sent, so a row's own trigger stays
 * disabled until this run's request for that person is answered; anyone
 * already in flight is skipped.
 */
export function useBulkRetrigger({
  claim,
  release,
  onFirstSuccess,
  onSettled,
}: {
  claim: (pubkeys: readonly string[]) => string[];
  release: (pubkey: string) => void;
  /** The first request of a run that succeeds (the console boosts its polling). */
  onFirstSuccess: () => void;
  /** A run finished: its table's selection is spent. */
  onSettled: (source: BulkSource) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Map<string, BulkStatus>>(new Map());
  const [, setErrors] = useState<Map<string, string>>(new Map());
  const [pending, setPending] = useState<BulkRequest | null>(null);
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);

  const run = useCallback(
    async (rawPubkeys: string[], source: BulkSource | "retry") => {
      // Claimed before anything is sent: a row's own trigger stays disabled
      // until this run's request for that person is answered.
      const unique = Array.from(new Set(rawPubkeys.filter(Boolean)));
      const toRun = claim(unique);
      const claimed = new Set(toRun);
      const skipped = unique.filter((pk) => !claimed.has(pk));
      if (toRun.length === 0) {
        toast({
          title: "Nothing to re-trigger",
          description: skipped.length
            ? `${skipped.length} pubkey(s) already in flight.`
            : "No valid pubkeys in selection.",
          variant: "destructive",
        });
        return;
      }
      setRunning(true);
      setLastResult(null);
      setErrors(new Map());
      const initial = new Map<string, BulkStatus>();
      toRun.forEach((pk) => initial.set(pk, "queued"));
      setStatuses(initial);

      let cursor = 0;
      const successes: string[] = [];
      const failures: { pubkey: string; error: string }[] = [];
      let firstSuccessFired = false;

      const worker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= toRun.length) return;
          const pk = toRun[i];
          setStatuses((prev) => {
            const next = new Map(prev);
            next.set(pk, "running");
            return next;
          });
          try {
            await apiClient.triggerUserGraperank(pk);
            release(pk);
            successes.push(pk);
            setStatuses((prev) => {
              const next = new Map(prev);
              next.set(pk, "success");
              return next;
            });
            if (!firstSuccessFired) {
              firstSuccessFired = true;
              onFirstSuccess();
            }
          } catch (err: unknown) {
            const msg =
              err instanceof Error
                ? err.message
                : typeof err === "object" && err !== null
                  ? JSON.stringify(err)
                  : "Unknown error";
            release(pk);
            failures.push({ pubkey: pk, error: msg });
            setStatuses((prev) => {
              const next = new Map(prev);
              next.set(pk, "failed");
              return next;
            });
            setErrors((prev) => {
              const next = new Map(prev);
              next.set(pk, msg);
              return next;
            });
          }
        }
      };
      const workers = Array.from({ length: Math.min(CONCURRENCY, toRun.length) }, () => worker());
      await Promise.all(workers);

      setRunning(false);
      const resultSource: BulkSource = source === "retry" ? (lastResult?.source ?? "users") : source;
      setLastResult({ source: resultSource, successes, failures });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title:
          failures.length === 0
            ? `Re-triggered ${successes.length} user${successes.length !== 1 ? "s" : ""}`
            : `${successes.length} succeeded, ${failures.length} failed`,
        description: skipped.length ? `${skipped.length} skipped (already in flight).` : undefined,
        variant: failures.length === 0 ? "default" : "destructive",
      });
      onSettled(resultSource);
    },
    [claim, release, toast, onFirstSuccess, queryClient, lastResult, onSettled],
  );

  /** Runs the confirmed request; a retry goes back to the table its failures came from. */
  const confirm = useCallback(() => {
    const target = pending;
    setPending(null);
    if (target) run(target.pubkeys, target.source === "retry" ? (lastResult?.source ?? "users") : target.source);
  }, [pending, run, lastResult]);

  /** Drops the last result if it came from `source` (that table's filter or range changed). */
  const dismissFrom = useCallback((source: BulkSource) => {
    setLastResult((prev) => (prev?.source === source ? null : prev));
  }, []);

  return {
    running,
    statuses,
    lastResult,
    dismiss: () => setLastResult(null),
    dismissFrom,
    pending,
    ask: setPending,
    cancel: () => setPending(null),
    confirm,
  };
}

export type BulkRetrigger = ReturnType<typeof useBulkRetrigger>;
