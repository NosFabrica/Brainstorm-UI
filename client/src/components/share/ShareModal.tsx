import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopied } from "@/hooks/useCopied";

/** Whether this browser has a share sheet of its own (phones; some desktops). */
export function canNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * One share sheet for every public page — a profile, a note, an article, a
 * hashtag. The link with Copy, a QR for a phone, the browser's own share
 * sheet where it has one, and two slots: a `preview` (the profile's OG card)
 * and an `extra` row (the profile's photo nudge). Before, Share looked and
 * behaved three different ways across pages (team, 2026-09-08).
 */
export function ShareModal({
  open,
  onOpenChange,
  url,
  title,
  kicker = "Share",
  heading = "Share this page",
  description = "Copy the link, or scan the code to open it on a phone.",
  preview,
  extra,
  openLink = false,
  testId = "modal-share",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The link shared, shown, copied and encoded. */
  url: string;
  /** The title the native sheet carries beside the link. */
  title: string;
  kicker?: string;
  heading?: string;
  description?: string;
  preview?: ReactNode;
  extra?: ReactNode;
  /** Offer "Open the page" — not when the sheet is opened from that page. */
  openLink?: boolean;
  testId?: string;
}) {
  const { copied, copy } = useCopied();
  const native = canNativeShare();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-900/5 overflow-hidden p-0 [&>button]:text-slate-400 dark:[&>button]:text-slate-500 [&>button]:hover:text-slate-700 dark:[&>button]:hover:text-slate-200 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 dark:[&>button]:hover:bg-slate-800 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid={testId}
      >
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <DialogHeader className="space-y-0 text-left">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-[11px] font-mono font-bold tracking-[0.25em] text-brand-link uppercase">{kicker}</span>
              <div className="h-px w-10 bg-brand-link/30" />
            </div>
            <DialogTitle className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              {heading}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{description}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
          {preview}
          {extra}

          {/* Link + copy */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 h-11 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 text-sm text-slate-700 dark:text-slate-200 font-mono truncate outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
              data-testid="share-link-input"
            />
            <button
              type="button"
              onClick={() => void copy(url)}
              className="shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold transition-colors"
              data-testid="share-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {openLink && (
            <a href={url} target="_blank" rel="noopener" className="-mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-link hover:underline" data-testid="share-open-page-link">
              Open the page <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5" data-testid="share-qr">
              <QRCodeSVG value={url || "https://brainstorm.world"} size={96} bgColor="#ffffff" fgColor="#0A0E18" level="M" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{native ? "Scan to open on a phone, or share directly:" : "Scan to open on a phone."}</p>
              {native && (
                <button
                  type="button"
                  onClick={() => navigator.share?.({ title, url }).catch(() => {})}
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
