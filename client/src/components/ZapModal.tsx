import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Check, ExternalLink, Loader2, AlertTriangle, ArrowRight, Wallet, ShieldCheck, ShieldAlert } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { FlashIcon } from "@/components/FlashIcon";
import { copyToClipboard } from "@/lib/clipboard";
import { initialsFor } from "@/lib/profileDefaults";
import { hasSessionToken } from "@/services/api";
import { useActiveAccount } from "applesauce-react/hooks";
import { signAs } from "@/accounts/signing";
import { signEventWithEphemeralKey, getVerifiedProfileLud16, PROFILE_RELAYS } from "@/services/nostr";
import {
  lnurlpFromAddress,
  buildZapRequest,
  requestInvoice,
  payWithWebLN,
  isWebLNAvailable,
  lightningUriForAddress,
  lightningUriForInvoice,
  satsToMsat,
  msatToSats,
  LnurlError,
  type LnurlPayParams,
} from "@/lib/zap";

interface ZapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientPubkey: string;
  lud16: string;
  displayName: string;
  picture?: string;
}

type Step = "loading" | "compose" | "invoice" | "fallback" | "error" | "unverified";

export function ZapModal({ open, onOpenChange, recipientPubkey, lud16, displayName, picture }: ZapModalProps) {
  const [step, setStep] = useState<Step>("loading");
  const [params, setParams] = useState<LnurlPayParams | null>(null);
  const [amount, setAmount] = useState("1000");
  const [comment, setComment] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paying, setPaying] = useState(false);
  // The lightning address read from the recipient's CRYPTOGRAPHICALLY VERIFIED
  // kind-0 — the only address we resolve/pay (never the unverified prop).
  const [verifiedLud16, setVerifiedLud16] = useState<string | null>(null);

  // Whoever is signed in signs the zap request; with nobody, it goes out anonymously.
  const account = useActiveAccount();
  // If the recipient's provider supports zaps we ALWAYS send a NIP-57 zap (so it
  // shows on nostr) — attributed to the viewer when signed in, otherwise an
  // anonymous zap signed with a throwaway key. Plain wallet-only payment is the
  // last resort, only when the provider doesn't support zaps.
  const recipientSupportsZaps = !!(params?.allowsNostr && params?.nostrPubkey);
  const isAttributed = recipientSupportsZaps && hasSessionToken() && !!account;
  // Address shown / paid: the verified one once known, the prop only as a
  // pre-verification placeholder in the header.
  const displayAddr = verifiedLud16 ?? lud16;
  const isVerified = !!verifiedLud16;

  // Resolve the lightning address when the modal opens. CORS / provider failure
  // routes straight to the address-QR fallback.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep("loading");
    setParams(null);
    setInvoice(null);
    setErrorMsg(null);
    setPaid(false);
    setComment("");
    setVerifiedLud16(null);
    (async () => {
      // SECURITY: verify the recipient's signed kind-0 and take the lightning
      // address from THAT verified event — never pay an unverified / forged
      // address served by a relay.
      const v = await getVerifiedProfileLud16(recipientPubkey);
      if (cancelled) return;
      if (!v.verified || !v.lud16) { setStep("unverified"); return; }
      setVerifiedLud16(v.lud16);
      try {
        const p = await lnurlpFromAddress(v.lud16);
        if (!cancelled) { setParams(p); setStep("compose"); }
      } catch {
        if (!cancelled) setStep("fallback");
      }
    })();
    return () => { cancelled = true; };
  }, [open, recipientPubkey]);

  const minSats = params ? Math.max(1, msatToSats(params.minSendable)) : 1;
  const maxSats = params ? msatToSats(params.maxSendable) : Infinity;
  const amountNum = Math.floor(Number(amount));
  const amountValid = Number.isFinite(amountNum) && amountNum >= minSats && amountNum <= maxSats;

  const copyInvoice = async (val: string) => {
    if (await copyToClipboard(val)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };

  const handleContinue = async () => {
    if (!params || !amountValid) return;
    setStep("loading");
    setErrorMsg(null);
    try {
      const amountMsat = satsToMsat(amountNum);
      const relays = Array.from(new Set(PROFILE_RELAYS));
      const commentText = comment.trim() || undefined;
      const anonZap = () =>
        signEventWithEphemeralKey(
          buildZapRequest({ recipientPubkey, amountMsat, lnurl: params.lnurlUrl, relays, comment: commentText, anon: true }),
        );
      let signedZapRequest: Record<string, unknown> | undefined;
      if (recipientSupportsZaps) {
        if (isAttributed && account) {
          try {
            signedZapRequest = await signAs(
              account,
              buildZapRequest({ recipientPubkey, amountMsat, lnurl: params.lnurlUrl, relays, comment: commentText }),
            );
          } catch {
            // Signer rejected → still send it, anonymously, so it appears on nostr.
            signedZapRequest = anonZap();
          }
        } else {
          // Logged out / no signer → anonymous zap.
          signedZapRequest = anonZap();
        }
      }
      const pr = await requestInvoice({
        callback: params.callback,
        amountMsat,
        comment: comment.trim() || undefined,
        commentAllowed: params.commentAllowed,
        signedZapRequest,
      });
      setInvoice(pr);
      setStep("invoice");
    } catch (e) {
      if (e instanceof LnurlError) { setStep("fallback"); return; }
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
      setStep("error");
    }
  };

  const handleWebLN = async () => {
    if (!invoice) return;
    setPaying(true);
    const r = await payWithWebLN(invoice);
    setPaying(false);
    if (r.ok) setPaid(true);
    else if (r.error && r.error !== "No browser wallet") setErrorMsg(r.error);
  };

  const verb = recipientSupportsZaps ? "Zap" : "Send";
  const noun = recipientSupportsZaps ? "Zap" : "sats";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 overflow-hidden p-0 [&>button]:text-slate-400 [&>button]:dark:text-slate-500 [&>button]:hover:text-slate-700 [&>button]:hover:dark:text-slate-200 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 [&>button]:hover:dark:bg-slate-800 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid="modal-zap"
      >
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              <FlashIcon className="h-4 w-4 text-yellow-400" /> {recipientSupportsZaps ? "Send a Zap" : "Send sats"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              Pay {displayName} over the Lightning Network.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
          {/* Recipient */}
          <div className="flex items-center gap-2.5 mb-4">
            <Avatar className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
              {picture ? <AvatarImage src={picture} alt={displayName} className="object-cover" /> : null}
              <AvatarFallback className="rounded-full bg-brand-primary/15 text-brand-primary text-xs font-bold">{initialsFor(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate font-mono inline-flex items-center gap-1 max-w-full">
                {isVerified && <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />}
                <span className="truncate">{displayAddr}</span>
              </p>
            </div>
          </div>

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500" data-testid="zap-loading">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="mt-2 text-xs">Connecting…</p>
            </div>
          )}

          {step === "compose" && (
            <div className="space-y-3" data-testid="zap-compose">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Amount (sats)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={minSats}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-11 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                  data-testid="zap-amount"
                />
                {Number.isFinite(maxSats) && (minSats > 1 || maxSats < 1_000_000) && (
                  <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                    {minSats.toLocaleString()}–{maxSats.toLocaleString()} sats
                  </p>
                )}
              </div>
              {(recipientSupportsZaps || params!.commentAllowed > 0) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Message <span className="font-normal text-slate-400 dark:text-slate-500">(optional)</span></label>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    maxLength={recipientSupportsZaps ? 280 : params!.commentAllowed || 280}
                    placeholder="Say something nice…"
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none resize-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                    data-testid="zap-comment"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={handleContinue}
                disabled={!amountValid}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                data-testid="zap-continue"
              >
                <FlashIcon className="h-4 w-4" /> {verb} {amountValid ? `${amountNum.toLocaleString()} sats` : noun}
              </button>
              {recipientSupportsZaps && !isAttributed && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                  Sending anonymously — sign in to zap as yourself.
                </p>
              )}
              {!recipientSupportsZaps && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                  This wallet doesn't support zaps — it'll be a private Lightning payment.
                </p>
              )}
            </div>
          )}

          {step === "invoice" && invoice && (
            <div className="space-y-3" data-testid="zap-invoice">
              {paid ? (
                <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="zap-paid">
                  <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Check className="h-6 w-6" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{recipientSupportsZaps ? "Zap sent!" : "Payment sent!"}</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center">
                    <div className="rounded-xl border border-slate-200 bg-white p-3" data-testid="zap-qr">
                      <QRCodeSVG value={invoice} size={188} bgColor="#ffffff" fgColor="#0A0E18" level="M" />
                    </div>
                  </div>
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400">Scan with a Lightning wallet to pay.</p>
                  {isWebLNAvailable() && (
                    <button
                      type="button"
                      onClick={handleWebLN}
                      disabled={paying}
                      className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                      data-testid="zap-webln"
                    >
                      {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />} Pay with wallet
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyInvoice(invoice)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                      data-testid="zap-copy-invoice"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy invoice"}
                    </button>
                    <a
                      href={lightningUriForInvoice(invoice)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                      data-testid="zap-open-wallet"
                    >
                      <ExternalLink className="h-4 w-4" /> Open wallet
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="w-full text-center text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors pt-1"
                    data-testid="zap-done"
                  >
                    Scanned &amp; paid? Done
                  </button>
                </>
              )}
            </div>
          )}

          {step === "fallback" && (
            <div className="space-y-3" data-testid="zap-fallback">
              <div className="flex justify-center">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <QRCodeSVG value={lightningUriForAddress(displayAddr)} size={188} bgColor="#ffffff" fgColor="#0A0E18" level="M" />
                </div>
              </div>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Scan this with any Lightning wallet to pay {displayName} — it'll ask you for the amount.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyInvoice(displayAddr)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                  data-testid="zap-copy-address"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy address"}
                </button>
                <a
                  href={lightningUriForAddress(displayAddr)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" /> Open wallet
                </a>
              </div>
            </div>
          )}

          {step === "unverified" && (
            <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="zap-unverified">
              <div className="h-11 w-11 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Couldn't verify this recipient</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[290px] leading-relaxed">
                We couldn't confirm a lightning address signed by {displayName}'s key. For your safety we won't send a payment to an unverified address.
              </p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-link hover:underline"
              >
                Close
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="zap-error">
              <div className="h-10 w-10 rounded-full bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 flex items-center justify-center text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Couldn't create the payment</p>
              {errorMsg && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[280px]">{errorMsg}</p>}
              <button
                type="button"
                onClick={() => setStep("compose")}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-link hover:underline"
              >
                Try again <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
