import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Home, Loader2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/hooks/use-toast";
import { relativeTime } from "@/lib/relativeTime";
import { readinessOf, type ReadinessRow } from "./readiness";
import { lastRunFor, rememberRun } from "./lastRuns";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserResultRow } from "@/components/admin/scheduling/UserResultRow";
import { BrainstormUserPicker } from "@/components/admin/billing/BrainstormUserPicker";
import type { BrainstormUser } from "@/components/admin/billing/brainstormUserSearch";
import { apiClient, TrustedListsUnavailableError, type TrustedListRunData } from "@/services/api";
import { resolveHouseObserver } from "@/services/trustSource";
import { fetchProfileMap } from "@/services/nostr";
import { npubFromPubkey } from "@/lib/shareId";
import { TrustedListRunResult } from "./TrustedListRunResult";

const HOUSE_NAME = "Brainstorm (house)";

/**
 * Publish one observer's Trusted Lists (server PR #86). The observer is the
 * customer the lists are for: the server keeps the tags used by people they
 * trust, builds a kind-30392 list per tag from their web of trust, signs each
 * with their Brainstorm key, and retracts the ones that no longer qualify.
 * Publishing signs public events under someone's key, so it asks first.
 */
export function TrustedListsCard({ initialObserver }: { initialObserver?: string } = {}) {
  const [observer, setObserver] = useState<BrainstormUser | null>(initialObserver ? { pubkey: initialObserver } : null);
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<TrustedListRunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A server without the endpoint isn't worth retrying; a failed run is.
  const [retryable, setRetryable] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Is their trust network in place? Under the admin-users key, so the Users
  // tab's refreshes (and a calculation started here) update it too.
  const readinessQuery = useQuery({
    queryKey: ["/api/admin/users", "trusted-lists-readiness", observer?.pubkey],
    queryFn: async (): Promise<ReadinessRow | null> => {
      const pubkey = observer!.pubkey;
      const page = await apiClient.getAdminUsers({ search: pubkey, size: 5 });
      const items = ((page as { items?: Array<ReadinessRow & { pubkey: string }> })?.items ?? []);
      return items.find((u) => u.pubkey === pubkey) ?? null;
    },
    enabled: !!observer,
  });

  async function calculateFirst() {
    if (!observer || calculating) return;
    setCalculating(true);
    try {
      await apiClient.triggerUserGraperank(observer.pubkey);
      toast({ title: "Calculation queued", description: "Publish once it finishes — usually a few minutes." });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    } catch (e) {
      toast({
        title: "Couldn't start the calculation",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  }

  // Sent from the Users tab with only a key: fill in who it is, best-effort.
  useEffect(() => {
    if (!initialObserver) return;
    let cancelled = false;
    fetchProfileMap([initialObserver])
      .then((profiles) => {
        const p = profiles.get(initialObserver);
        if (cancelled || !p) return;
        setObserver((o) =>
          o && o.pubkey === initialObserver ? { ...o, name: p.display_name || p.name, picture: p.picture } : o,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialObserver]);

  // Until a new run replaces it, the last one this browser saw for them.
  const remembered = observer && !result && !publishing ? lastRunFor(observer.pubkey) : null;

  const name = observer ? observer.name || `${npubFromPubkey(observer.pubkey).slice(0, 12)}…` : "";

  async function chooseHouse() {
    setError(null);
    const pubkey = await resolveHouseObserver();
    if (!pubkey) {
      setError("Couldn't find the Brainstorm house key.");
      return;
    }
    setObserver({ pubkey, name: HOUSE_NAME });
  }

  async function publish() {
    // The server has no lock, so a second press would publish twice.
    if (!observer || publishing) return;
    setConfirming(false);
    setPublishing(true);
    setError(null);
    setResult(null);
    try {
      const run = await apiClient.publishTrustedLists(observer.pubkey);
      rememberRun(run);
      setResult(run);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing failed");
      setRetryable(!(e instanceof TrustedListsUnavailableError));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid="trusted-lists-card">
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Trusted Lists</h3>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Publish an observer's lists — built from their web of trust, signed by their Brainstorm key.
        </p>
      </div>

      {observer ? (
        <div data-testid="trusted-lists-observer">
          <UserResultRow
            pubkey={observer.pubkey}
            npub={npubFromPubkey(observer.pubkey)}
            name={observer.name}
            picture={observer.picture}
            active
            trailing={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setObserver(null);
                  setResult(null);
                  setError(null);
                }}
              >
                Change
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={chooseHouse}>
            <Home className="h-4 w-4" /> {HOUSE_NAME}
          </Button>
          <BrainstormUserPicker
            value={null}
            onChange={(u) => u && setObserver(u)}
            inputTestId="input-trusted-lists-observer"
            resultTestIdPrefix="trusted-lists-result-"
            noAccountHint="Only someone with a Brainstorm account can have trusted lists."
          />
        </div>
      )}

      {observer && readinessQuery.isSuccess && (
        <Readiness
          row={readinessQuery.data}
          calculating={calculating}
          onCalculate={() => void calculateFirst()}
        />
      )}

      {observer && (
        <Button
          type="button"
          className="gap-1.5"
          disabled={publishing}
          onClick={() => setConfirming(true)}
          data-testid="trusted-lists-publish"
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Publishing… up to a minute
            </>
          ) : (
            "Publish trusted lists"
          )}
        </Button>
      )}

      {error && (
        <Alert variant="destructive" data-testid="trusted-lists-error">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            {/* Already confirmed: trying again repeats the same publish. */}
            {retryable && observer && (
              <Button type="button" variant="outline" size="sm" onClick={() => void publish()} disabled={publishing}>
                Try again
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {result ? (
        <TrustedListRunResult run={result} observerName={name} />
      ) : (
        remembered && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="trusted-lists-remembered">
              Last run on this device · {relativeTime(Math.floor(Date.parse(remembered.at) / 1000))}. The server doesn't keep
              runs yet, so this is only what this browser saw.
            </p>
            <TrustedListRunResult run={remembered.run} observerName={name} />
          </div>
        )
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md" data-testid="trusted-lists-confirm">
          <DialogHeader>
            <DialogTitle>Publish {name}'s trusted lists?</DialogTitle>
            <DialogDescription>
              Their lists are built from their web of trust and published to the relay, signed by their Brainstorm key.
              Lists whose tags no longer qualify are retracted. This can take up to a minute.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void publish()}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Whether the chosen observer's trust network is in place — the most common
 * reason a publish comes back empty — and, when it isn't, a way to start it.
 */
function Readiness({
  row,
  calculating,
  onCalculate,
}: {
  row: ReadinessRow | null;
  calculating: boolean;
  onCalculate: () => void;
}) {
  const r = readinessOf(row);
  const start = (label: string) => (
    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={calculating} onClick={onCalculate}>
      {calculating && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {label}
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300" data-testid="trusted-lists-readiness">
      {r.kind === "ready" && (
        <>
          <Chip tone="success" size="sm" dot>Ready</Chip>
          <span>
            Trust network calculated
            {r.calculatedAt ? ` ${relativeTime(Math.floor(Date.parse(r.calculatedAt) / 1000))}` : ""}.
          </span>
        </>
      )}
      {r.kind === "never" && (
        <>
          <Chip tone="warning" size="sm" dot>Not calculated</Chip>
          <span className="basis-full sm:basis-auto sm:flex-1">
            Their trust network hasn't been calculated yet, so nobody would qualify and their lists would come back empty.
          </span>
          {start("Calculate first")}
        </>
      )}
      {r.kind === "failed" && (
        <>
          <Chip tone="danger" size="sm" dot>Failed</Chip>
          <span className="basis-full sm:basis-auto sm:flex-1">
            Their last trust calculation failed — their lists may come back empty.
          </span>
          {start("Calculate again")}
        </>
      )}
      {r.kind === "pending" && (
        <>
          <Chip tone="info" size="sm" dot>Calculating</Chip>
          <span>Their trust network is being calculated — publish once it finishes.</span>
        </>
      )}
    </div>
  );
}
