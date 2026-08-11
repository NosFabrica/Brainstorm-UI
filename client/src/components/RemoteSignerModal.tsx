/**
 * Connecting a remote signer: three routes on one screen, promoted by platform.
 *
 * A signer can live on a second device even when Brainstorm is on the phone, so
 * none of the three is ever hidden — only the emphasis moves. Amber registers
 * `nostrconnect://` as a deep link, which is why a same-device QR is never the
 * mobile default.
 *
 * The waiting state carries two indicators that must never be conflated: whether
 * we can reach the relays at all, and whether the signer has approved. NIP-46
 * reports neither — a publish to a dead relay looks exactly like a user who
 * hasn't picked up their phone — so the first comes from the pool and the second
 * from a clock.
 */
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { use$ } from "applesauce-react/hooks";
import {
  AlertTriangle,
  Check,
  ClipboardPaste,
  Copy,
  Loader2,
  QrCode,
  Radio,
  Smartphone,
} from "lucide-react";

import {
  beginRemotePairing,
  bunkerUriProblem,
  connectWithBunkerURI,
  isPairingCancelled,
  remoteSignerMessage,
  type RemotePairing,
} from "@/accounts/remote-login";
import { relaysReachable$ } from "@/accounts/remote-transport";
import type { BrainstormAccount } from "@/accounts/metadata";
import { signInWithExternalSigner } from "@/services/nostr";
import { useIsMobile } from "@/hooks/use-mobile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** After this long with no answer, the likeliest cause is an unread notification. */
const NUDGE_AFTER_MS = 15_000;

export type RemoteSignerModalProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Signed in through a signer — the page decides where that goes. */
  onSignedIn(): void;
};

export function RemoteSignerModal({ open, onOpenChange, onSignedIn }: RemoteSignerModalProps) {
  const mobile = useIsMobile();
  const [pairing, setPairing] = useState<RemotePairing | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waited, setWaited] = useState(0);

  const finish = useCallback(
    async (account: BrainstormAccount, pairing?: RemotePairing) => {
      await signInWithExternalSigner(account);
      // Before the screen closes: closing cancels the pairing, and cancelling
      // would shut the connection this Account now signs over.
      pairing?.keep();
      onSignedIn();
    },
    [onSignedIn],
  );

  // One pairing per opening. Restarting mints a new client keypair, so the URI
  // on screen is always the one the waiting signer is listening for.
  const start = useCallback(() => {
    setError(null);
    setWaited(0);
    const next = beginRemotePairing();
    setPairing(next);
    next.completed.then(
      (account) => void finish(account, next).catch((err) => setError(remoteSignerMessage(err))),
      (err) => {
        if (!isPairingCancelled(err)) setError(remoteSignerMessage(err));
      },
    );
    return next;
  }, [finish]);

  useEffect(() => {
    if (!open) return;
    const started = start();
    return () => started.cancel();
  }, [open, start]);

  // Elapsed, not a countdown: the deadline is ours and generous, and showing it
  // would read as pressure on someone walking to another room.
  useEffect(() => {
    if (!open || !pairing) return;
    const tick = setInterval(() => setWaited((seconds) => seconds + 1), 1000);
    return () => clearInterval(tick);
  }, [open, pairing]);

  const copy = async () => {
    if (!pairing) return;
    try {
      await navigator.clipboard.writeText(pairing.uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't reach the clipboard. Select the link and copy it by hand.");
    }
  };

  const submitPasted = async () => {
    const problem = bunkerUriProblem(pasted);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await finish(await connectWithBunkerURI(pasted));
    } catch (err) {
      setError(remoteSignerMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="remote-signer-modal">
        <DialogHeader>
          <DialogTitle>Sign in with a signer app</DialogTitle>
          <DialogDescription>
            Your key stays in the signer. Brainstorm asks it to sign, and it asks you.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" data-testid="text-remote-signer-error">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {pasting ? (
          <PastePane
            value={pasted}
            onChange={setPasted}
            busy={busy}
            onSubmit={submitPasted}
            onBack={() => {
              setPasting(false);
              setError(null);
            }}
          />
        ) : (
          <ConnectPane
            pairing={pairing}
            mobile={mobile}
            showQr={showQr || !mobile}
            onShowQr={() => setShowQr(true)}
            copied={copied}
            onCopy={copy}
            waited={waited}
            onPaste={() => {
              setPasting(true);
              setError(null);
            }}
            onRetry={start}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConnectPane({
  pairing,
  mobile,
  showQr,
  onShowQr,
  copied,
  onCopy,
  waited,
  onPaste,
  onRetry,
}: {
  pairing: RemotePairing | null;
  mobile: boolean;
  showQr: boolean;
  onShowQr(): void;
  copied: boolean;
  onCopy(): void;
  waited: number;
  onPaste(): void;
  onRetry(): void;
}) {
  if (!pairing) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Deep link first on a phone: on Android this hands straight to Amber, and a
  // QR you'd have to photograph with the same screen it's on is no use to anyone.
  const openApp = (
    <Button asChild className="w-full" variant={mobile ? "primary" : "outline"}>
      <a href={pairing.uri} data-testid="link-open-signer-app">
        <Smartphone /> Open my signer app
      </a>
    </Button>
  );

  const qr = showQr ? (
    <div className="flex flex-col items-center gap-2" data-testid="remote-signer-qr">
      {/*
        A `nostrconnect://` URI is long — twelve permissions and the metadata —
        so the code is dense and each module ends up tiny. At 188px phones
        couldn't focus on it. Sized to the dialog, and at error-correction L
        rather than M: this is a clean screen, not a printed label, so spending
        modules on damage recovery only makes them smaller.
      */}
      <div className="rounded-xl bg-white p-3 w-full max-w-[320px]">
        <QRCodeSVG
          value={pairing.uri}
          bgColor="#ffffff"
          fgColor="#0A0E18"
          level="L"
          className="h-auto w-full"
        />
      </div>
      <p className="text-xs text-muted-foreground">Scan this with your signer app</p>
    </div>
  ) : (
    <Button variant="outline" className="w-full" onClick={onShowQr} data-testid="button-show-qr">
      <QrCode /> Signer on another device? Show a QR
    </Button>
  );

  return (
    <div className="space-y-4">
      {mobile ? (
        <>
          {openApp}
          {qr}
        </>
      ) : (
        <>
          {qr}
          {openApp}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onCopy} data-testid="button-copy-connect-uri">
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy the link"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onPaste} data-testid="button-paste-bunker">
          <ClipboardPaste /> Paste a link from my signer
        </Button>
      </div>

      <WaitingState relays={pairing.relays} waited={waited} onRetry={onRetry} />
    </div>
  );
}

/**
 * The two independent facts. Relays down is ours to fix; not-approved-yet is
 * theirs, and saying the first when we mean the second sends people looking for
 * a problem they don't have.
 */
function WaitingState({
  relays,
  waited,
  onRetry,
}: {
  relays: string[];
  waited: number;
  onRetry(): void;
}) {
  const key = relays.join(",");
  const reachable = use$(() => relaysReachable$(relays), [key]);

  if (reachable === false && waited > 3) {
    return (
      <Alert variant="warning" data-testid="notice-relays-unreachable">
        <Radio className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>Can't reach the relays this connection runs over.</span>
          <Button variant="outline" size="sm" onClick={onRetry} data-testid="button-retry-pairing">
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert data-testid="notice-waiting-for-signer">
      <Loader2 className="h-4 w-4 animate-spin" />
      <AlertDescription>
        Waiting for you to approve this in your signer.
        {waited * 1000 > NUDGE_AFTER_MS && (
          <>
            {" "}
            {/* The commonest cause of a stuck pairing by a wide margin: Amber
                answers an un-remembered request with a notification and nothing
                on the wire, so there is no other sign anything is waiting. */}
            <span className="font-medium">
              Nothing yet — open the app and check for a notification waiting there.
            </span>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

function PastePane({
  value,
  onChange,
  busy,
  onSubmit,
  onBack,
}: {
  value: string;
  onChange(next: string): void;
  busy: boolean;
  onSubmit(): void;
  onBack(): void;
}) {
  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="bunker://…"
        rows={3}
        className="font-mono text-xs"
        data-testid="input-bunker-uri"
      />
      {/* Honest rather than hand-holding: nsec.app's token dies in ten minutes
          and is single-use, and Amber mints a new one every time the URI is
          viewed. A link copied yesterday will not work. */}
      <p className="text-xs text-muted-foreground">
        These links are single-use and short-lived — copy it from your signer and paste it straight
        away.
      </p>
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-connect">
          Back
        </Button>
        <Button onClick={onSubmit} disabled={busy} data-testid="button-connect-bunker">
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </div>
  );
}
