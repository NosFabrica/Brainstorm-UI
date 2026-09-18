import { useEffect, useState } from "react";
import { Home, Loader2 } from "lucide-react";
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
      setResult(await apiClient.publishTrustedLists(observer.pubkey));
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
      {result && <TrustedListRunResult run={result} observerName={name} />}

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
