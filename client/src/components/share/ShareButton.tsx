import { useRef, useState, type ReactNode } from "react";
import { Share2 } from "lucide-react";
import { ShareModal, canNativeShare } from "@/components/share/ShareModal";
import { shortOrLong } from "@/lib/shortLink";

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
  mint,
  testId = "share-open-modal",
  className = PILL,
}: {
  url: string;
  /** The title the share sheet carries beside the link. */
  title: string;
  /** A richer sheet than the default modal, given the open state to drive. */
  modal?: (ctl: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  /** Mints a short link to share instead of `url`; started on press, `url` if it's slow or fails. */
  mint?: () => Promise<string>;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Tagged with its mint, so a page reused for another entity never shows the last one's link.
  const [minted, setMinted] = useState<{ mint: () => Promise<string>; url: string } | null>(null);
  const minting = useRef<Promise<string> | null>(null);
  const startMint = () => {
    if (mint && !minting.current) minting.current = mint();
  };
  const share = async () => {
    startMint();
    const pending = minting.current;
    minting.current = null;
    if (pending && mint)
      pending.then(
        (short) => setMinted({ mint, url: short }),
        () => {},
      );
    if (!canNativeShare()) {
      setOpen(true);
      return;
    }
    const shareUrl = pending ? await shortOrLong(pending, url) : url;
    // A browser stricter about the gesture than Chromium refuses the late call: one more tap, on our sheet.
    navigator.share?.({ title, url: shareUrl }).catch((e: unknown) => {
      if (pending && (e as { name?: string } | null)?.name === "NotAllowedError") setOpen(true);
    });
  };
  return (
    <>
      <button
        type="button"
        onPointerDown={startMint}
        onClick={() => void share()}
        className={className}
        data-testid={testId}
      >
        <Share2 className="h-4 w-4" /> Share
      </button>
      {modal ? (
        modal({ open, onOpenChange: setOpen })
      ) : (
        <ShareModal
          open={open}
          onOpenChange={setOpen}
          url={minted && minted.mint === mint ? minted.url : url}
          title={title}
        />
      )}
    </>
  );
}
