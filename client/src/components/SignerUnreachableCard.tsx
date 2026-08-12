/**
 * The one surface that says a remote signer has gone away.
 *
 * NIP-46 has no revocation signal, so nothing else ever will: Amber's "Reset
 * Bunker" mints a new per-connection key and "Delete application" drops the
 * pairing, and in both cases our stored `remote` quietly becomes a pubkey nobody
 * listens on. Without this the account reads as perfectly healthy until the user
 * writes a note and *that* fails instead — which blames the wrong thing at the
 * worst moment.
 *
 * Not a modal. The user chose nothing here, and everything except signing still
 * works: reading, browsing, their own cached data. A wall would take away more
 * than it explains.
 */
import { useState } from "react";
import { Loader2, RefreshCw, Radio } from "lucide-react";
import { Link } from "wouter";

import { recheckSigner } from "@/accounts/signer-liveness";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Presentational on purpose. Reading the hook here as well as in the strip would
 * mean two subscriptions to a cold observable — two probes, and a card that
 * renders nothing while the strip has already given it the floor, leaving a blank
 * space for as long as the round trip takes.
 */
export function SignerUnreachableCard() {
  const [rechecking, setRechecking] = useState(false);

  // No completion signal to wait on — the answer arrives as the card unmounting,
  // or not. Long enough to read as "asked", short enough not to look stuck.
  const recheck = () => {
    setRechecking(true);
    recheckSigner();
    setTimeout(() => setRechecking(false), 2_000);
  };

  return (
    <Card
      className="w-full max-w-3xl mx-auto mt-4 flex flex-wrap items-center gap-3 px-4 py-3"
      data-testid="card-signer-unreachable"
    >
      <span className="h-9 w-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
        <Radio className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Your signer isn't answering</p>
        <p className="text-[13px] text-muted-foreground leading-snug">
          Reading still works. Publishing needs your signer — open it and check it's running, or
          connect it again.
        </p>
      </div>
      {/*
        Asked again rather than assumed dead: by far the commonest cause is a
        phone that was simply asleep, and that costs one message to rule out.
      */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={recheck}
        disabled={rechecking}
        className="shrink-0"
        data-testid="button-recheck-signer"
      >
        {rechecking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {rechecking ? "Checking…" : "Check again"}
      </Button>
      {/*
        The card has to lead somewhere. A reset or deleted pairing cannot be
        recovered by waiting — re-pairing is the only way back.
      */}
      <Button asChild size="sm" className="shrink-0">
        <Link href="/login?add=1" data-testid="link-repair-signer">
          Connect again
        </Link>
      </Button>
    </Card>
  );
}
