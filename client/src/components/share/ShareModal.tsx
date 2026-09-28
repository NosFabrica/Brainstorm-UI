import type { ReactNode } from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopied } from "@/hooks/useCopied";
import { LazyQRCode } from "@/components/LazyQRCode";
import { qrPayload } from "@/lib/shortLink";

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
  /** The link shared, shown and copied; the QR encodes `qrPayload(url)`. */
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
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900 sm:max-w-[440px] [&>button]:rounded-md [&>button]:p-1 [&>button]:text-slate-400 [&>button]:opacity-100 [&>button]:transition-colors [&>button]:hover:bg-slate-100 [&>button]:hover:text-slate-700 dark:[&>button]:text-slate-500 dark:[&>button]:hover:bg-slate-800 dark:[&>button]:hover:text-slate-200"
        data-testid={testId}
      >
        <div className="px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
          <DialogHeader className="space-y-0 text-left">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-brand-link">
                {kicker}
              </span>
              <div className="h-px w-10 bg-brand-link/30" />
            </div>
            <DialogTitle
              className="text-lg font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {heading}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
          {preview}
          {extra}

          {/* Link + copy */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-700 outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              data-testid="share-link-input"
            />
            <button
              type="button"
              onClick={() => void copy(url)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
              data-testid="share-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {openLink && (
            <a
              href={url}
              target="_blank"
              rel="noopener"
              className="-mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-link hover:underline"
              data-testid="share-open-page-link"
            >
              Open the page <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5" data-testid="share-qr">
              <LazyQRCode
                value={qrPayload(url) || "https://brainstorm.world"}
                size={96}
                bgColor="#ffffff"
                fgColor="#0A0E18"
                level="M"
              />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {native ? "Scan to open on a phone, or share directly:" : "Scan to open on a phone."}
              </p>
              {native && (
                <button
                  type="button"
                  onClick={() => navigator.share?.({ title, url }).catch(() => {})}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
