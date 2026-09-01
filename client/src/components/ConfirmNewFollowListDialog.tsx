import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isRelayUrl } from "@/config/tagging";

/** Mirrors `RecoverFollowListOutcome` structurally; kept local so the dialog stays presentational. */
export interface RelaySearchResult {
  found: boolean;
  follows?: number;
  error?: string;
}

interface ConfirmNewFollowListDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /**
   * Search a user-named relay for the existing list. On `found: true` the
   * PARENT closes the dialog and resumes the publish on the recovered base —
   * the dialog itself only renders the not-found and error outcomes.
   */
  onSearchRelay: (relayUrl: string) => Promise<RelaySearchResult>;
  busy?: boolean;
}

/**
 * Shown when `followPubkeys` returns `needsBaseConfirmation` — we found no
 * follow list on the user's relays, which for an imported key is
 * indistinguishable from a fetch that failed. Publishing anyway would replace
 * whatever list actually exists (kind 3 is replaceable), so the destructive
 * path requires explicit consent to the one question only the user can answer:
 * "have you ever followed anyone with this key?"
 *
 * The relay search is the machine-answerable way out: a user who knows where
 * their list lives can point us at the relay, and a verified find removes the
 * ambiguity entirely — no guess, no destructive publish. Cancel is the default;
 * nothing has been published either way.
 */
export function ConfirmNewFollowListDialog({
  open,
  onCancel,
  onConfirm,
  onSearchRelay,
  busy = false,
}: ConfirmNewFollowListDialogProps) {
  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<RelaySearchResult | null>(null);
  // A search resolving after the dialog closed (or a newer search started) must
  // not touch state — the epoch marks which in-flight search is still current.
  const epochRef = useRef(0);

  useEffect(() => {
    epochRef.current++;
    setDraft("");
    setSearching(false);
    setResult(null);
  }, [open]);

  const search = async () => {
    const url = draft.trim();
    if (!isRelayUrl(url) || searching || busy) return;
    const epoch = ++epochRef.current;
    setSearching(true);
    setResult(null);
    let res: RelaySearchResult;
    try {
      res = await onSearchRelay(url);
    } catch {
      res = { found: false, error: "Something went wrong — try again." };
    }
    if (epoch !== epochRef.current) return;
    setSearching(false);
    if (!res.found) setResult(res);
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent data-testid="dialog-confirm-new-follow-list">
        <AlertDialogHeader>
          <AlertDialogTitle>We couldn't find an existing follow list</AlertDialogTitle>
          <AlertDialogDescription>
            We checked your relays and couldn't find a follow list for this key. If you've
            followed people before — here or in another app — publishing now could replace
            that list. Cancel and try again in a moment, continue only if you've never
            followed anyone with this key — or, if you know a relay that has your list,
            search it below.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="border-t pt-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Know a relay that has your follow list? We can check it directly.
          </p>
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }}
              placeholder="wss://relay.example.com"
              className="font-mono text-xs"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={searching || busy}
              data-testid="input-recovery-relay"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void search()}
              disabled={!isRelayUrl(draft) || searching || busy}
              data-testid="button-search-relay"
            >
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                "Search this relay"
              )}
            </Button>
          </div>
          {result && !result.found && (
            <p
              className={result.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
              data-testid="text-relay-search-status"
            >
              {result.error ??
                "No follow list for this key on that relay. Try another relay, or continue below."}
            </p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={busy} data-testid="button-new-follow-list-cancel">
            Cancel — try again later
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={busy || searching}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-new-follow-list-confirm"
          >
            I've never followed anyone — continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
