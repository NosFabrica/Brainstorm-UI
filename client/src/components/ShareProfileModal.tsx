import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { Copy, Check, Share2, ExternalLink, ImagePlus, ArrowRight } from "lucide-react";
import { ShareOgCard } from "@/components/ShareOgCard";
import { copyToClipboard } from "@/lib/clipboard";

interface ShareProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  npub: string;
  displayName: string;
  picture?: string;
  nip05?: string;
  canonicalUrl: string;
  /** House Web-of-Trust score (0–1) — shown as the trust pill on the preview card. */
  score01?: number | null;
  /** Invite framing (for sharing your OWN profile to bring people in). */
  invite?: boolean;
  /** True when the modal is opened FROM the public page itself — hides the
      redundant "Open the page" link (it would point at the current page). */
  onOwnPage?: boolean;
}

/**
 * Share sheet for a profile: a preview of the link-unfurl (OG) card, the
 * shareable link with copy, native share, and a QR code. The link is the
 * canonical `/p/:npub` URL today; when the short-URL service lands it swaps in
 * here (the page passes the resolved URL).
 */
export function ShareProfileModal({ open, onOpenChange, npub, displayName, picture, nip05, canonicalUrl, score01, invite = false, onOwnPage = false }: ShareProfileModalProps) {
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    const ok = await copyToClipboard(canonicalUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const nativeShare = () => {
    navigator.share?.({ title: `${displayName} on Brainstorm`, url: canonicalUrl }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 overflow-hidden p-0 [&>button]:text-slate-400 dark:[&>button]:text-slate-500 [&>button]:hover:text-slate-700 dark:[&>button]:hover:text-slate-200 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 dark:[&>button]:hover:bg-slate-800 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid="modal-share-profile"
      >
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {invite ? "Invite to Brainstorm" : "Share this profile"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              {invite
                ? "Share your link — when someone joins through it, they start connected to you."
                : "Reputation scored by real connections — not an algorithm."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
          {/* OG preview — clickable: opens the live share page in a new tab. */}
          <a
            href={canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:border-brand-primary/25 hover:shadow-md transition-all"
            data-testid="share-open-page-card"
          >
            <ShareOgCard displayName={displayName} picture={picture} nip05={nip05} score01={score01} />
          </a>

          {/* Payoff nudge: sharing your OWN profile with no photo looks bare —
              the share moment is exactly when a profile photo pays off. */}
          {invite && !picture && (
            <button
              type="button"
              onClick={() => { onOpenChange(false); navigate("/settings?tab=profile"); }}
              className="w-full flex items-center gap-2.5 rounded-xl border border-brand-accent/30 bg-brand-accent/[0.06] px-3.5 py-2.5 text-left hover:border-brand-accent/50 transition-colors"
              data-testid="share-add-photo-nudge"
            >
              <span className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-brand-accent/20 flex items-center justify-center text-brand-deep shrink-0">
                <ImagePlus className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-slate-900 dark:text-slate-100">Add a photo first</span>
                <span className="block text-[12px] text-slate-500 dark:text-slate-400">Your shared profile looks more complete with one.</span>
              </span>
              <ArrowRight className="h-4 w-4 text-brand-link shrink-0" />
            </button>
          )}

          {/* Link + copy */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={canonicalUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 h-11 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 text-sm text-slate-700 dark:text-slate-200 font-mono truncate outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              data-testid="share-link-input"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold transition-colors"
              data-testid="share-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {!onOwnPage && (
            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="-mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-link hover:underline"
              data-testid="share-open-page-link"
            >
              Open the page <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <div className="flex items-center gap-4">
            {/* QR */}
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5" data-testid="share-qr">
              <QRCodeSVG value={canonicalUrl || "https://brainstorm.world"} size={96} bgColor="#ffffff" fgColor="#0A0E18" level="M" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Scan to open on a phone, or share directly:</p>
              {canNativeShare && (
                <button
                  type="button"
                  onClick={nativeShare}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                  data-testid="share-native"
                >
                  <Share2 className="h-4 w-4" /> Share…
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
