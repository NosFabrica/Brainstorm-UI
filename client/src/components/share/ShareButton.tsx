import { useState, type ReactNode } from "react";
import { Share2 } from "lucide-react";
import { ShareModal, canNativeShare } from "@/components/share/ShareModal";

/** The header's Share pill — 36px, a match for the h-9 controls beside it. */
const PILL =
  "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold transition-colors";

/**
 * One Share on every public page — profile, note, article, hashtag. The
 * same pill, the same behaviour: the browser's share sheet where it has
 * one (phones), the share modal where it does not. A page with a richer
 * sheet — the profile, with its OG card — passes it in as `modal`.
 * Before, Share looked and behaved three different ways across pages and
 * was missing from a fourth (team, 2026-09-08).
 */
export function ShareButton({
  url,
  title,
  modal,
  testId = "share-open-modal",
  className = PILL,
}: {
  url: string;
  /** The title the share sheet carries beside the link. */
  title: string;
  /** A richer sheet than the default modal, given the open state to drive. */
  modal?: (ctl: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const share = () => {
    if (canNativeShare()) {
      navigator.share?.({ title, url }).catch(() => {});
      return;
    }
    setOpen(true);
  };
  return (
    <>
      <button type="button" onClick={share} className={className} data-testid={testId}>
        <Share2 className="h-4 w-4" /> Share
      </button>
      {modal ? modal({ open, onOpenChange: setOpen }) : <ShareModal open={open} onOpenChange={setOpen} url={url} title={title} />}
    </>
  );
}
