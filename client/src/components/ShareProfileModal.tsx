import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Copy, Check, Share2, ExternalLink } from "lucide-react";
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
  /** Invite framing (for sharing your OWN profile to bring people in). */
  invite?: boolean;
}

/**
 * Share sheet for a profile: a preview of the link-unfurl (OG) card, the
 * shareable link with copy, native share, and a QR code. The link is the
 * canonical `/p/:npub` URL today; when the short-URL service lands it swaps in
 * here (the page passes the resolved URL).
 */
export function ShareProfileModal({ open, onOpenChange, npub, displayName, picture, nip05, canonicalUrl, invite = false }: ShareProfileModalProps) {
  const [copied, setCopied] = useState(false);
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
        className="sm:max-w-[440px] rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 overflow-hidden p-0 [&>button]:text-slate-400 [&>button]:hover:text-slate-700 [&>button]:opacity-100 [&>button]:hover:bg-slate-100 [&>button]:rounded-md [&>button]:p-1 [&>button]:transition-colors"
        data-testid="modal-share-profile"
      >
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-2">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 leading-tight tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {invite ? "Invite to Brainstorm" : "Share this profile"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
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
            className="block rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:border-indigo-300 hover:shadow-md transition-all"
            data-testid="share-open-page-card"
          >
            <ShareOgCard displayName={displayName} picture={picture} nip05={nip05} />
          </a>

          {/* Link + copy */}
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={canonicalUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 h-11 rounded-xl bg-slate-50 border border-slate-200 px-3 text-sm text-slate-700 font-mono truncate outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              data-testid="share-link-input"
            />
            <button
              type="button"
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-[#3730a3] hover:bg-[#312e81] text-white text-sm font-semibold transition-colors"
              data-testid="share-copy-link"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <a
            href={canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="-mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#3730a3] hover:underline"
            data-testid="share-open-page-link"
          >
            Open the page <ExternalLink className="h-3 w-3" />
          </a>

          <div className="flex items-center gap-4">
            {/* QR */}
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2.5" data-testid="share-qr">
              <QRCodeSVG value={canonicalUrl || "https://brainstorm.world"} size={96} bgColor="#ffffff" fgColor="#1e1b4b" level="M" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-slate-500 leading-relaxed">Scan to open on a phone, or share directly:</p>
              {canNativeShare && (
                <button
                  type="button"
                  onClick={nativeShare}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors"
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
