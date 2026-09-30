import { useLocation } from "wouter";
import { ArrowRight, ImagePlus } from "lucide-react";
import { nip19 } from "nostr-tools";
import { ShareOgCard } from "@/components/ShareOgCard";
import { ShareModal } from "@/components/share/ShareModal";

interface ShareProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  npub: string;
  displayName: string;
  picture?: string;
  nip05?: string;
  shareUrl: string;
  /** House Web-of-Trust score (0–1) — shown as the trust pill on the preview card. */
  score01?: number | null;
  /** Invite framing (for sharing your OWN profile to bring people in). */
  invite?: boolean;
  /** True when the modal is opened FROM the public page itself — hides the
      redundant "Open the page" link (it would point at the current page). */
  onOwnPage?: boolean;
}

/**
 * The profile's share sheet: the generic ShareModal (link, copy, QR, native
 * share) with a preview of the link-unfurl (OG) card on top, and — when
 * inviting from a profile with no photo — a nudge to add one, since the
 * share moment is exactly when a photo pays off.
 *
 * `shareUrl` is whatever the caller decided to hand out — a short `/s/:code`
 * link when the shortener obliged, the canonical `/p/:npub` otherwise. It is
 * deliberately NOT named canonical: the page's own canonical URL (its `og:url`)
 * is the `/p/` one, and that is a different thing from the link people share.
 * `useShareUrl` is the one place that decides.
 */
export function ShareProfileModal({
  open,
  onOpenChange,
  npub,
  displayName,
  picture,
  nip05,
  shareUrl,
  score01,
  invite = false,
  onOwnPage = false,
}: ShareProfileModalProps) {
  const [, navigate] = useLocation();
  // The OG card only checks the handle against this key (lib/nip05).
  let pubkey: string | undefined;
  try {
    const d = nip19.decode(npub);
    if (d.type === "npub") pubkey = d.data;
  } catch {
    /* no key, no check */
  }
  return (
    <ShareModal
      open={open}
      onOpenChange={onOpenChange}
      url={shareUrl}
      title={`${displayName} on Brainstorm`}
      testId="modal-share-profile"
      kicker={invite ? "Grow your network" : "Verification Score"}
      heading={invite ? "Invite to Brainstorm" : "Share this profile"}
      description={
        invite
          ? "Share your link — when someone joins through it, they start connected to you."
          : "Reputation scored by real connections — not an algorithm."
      }
      openLink={!onOwnPage}
      preview={
        // The OG preview — clickable: opens the live share page in a new tab.
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener"
          className="block overflow-hidden rounded-xl border border-slate-200 shadow-sm transition-all hover:border-brand-primary/25 hover:shadow-md dark:border-slate-800"
          data-testid="share-open-page-card"
        >
          <ShareOgCard displayName={displayName} picture={picture} nip05={nip05} pubkey={pubkey} score01={score01} />
        </a>
      }
      extra={
        invite && !picture ? (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate("/settings?tab=profile");
            }}
            className="flex w-full items-center gap-2.5 rounded-xl border border-brand-accent/30 bg-brand-accent/[0.06] px-3.5 py-2.5 text-left transition-colors hover:border-brand-accent/50"
            data-testid="share-add-photo-nudge"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-accent/20 bg-white text-brand-deep dark:bg-slate-900">
              <ImagePlus className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                Add a photo first
              </span>
              <span className="block text-[12px] text-slate-500 dark:text-slate-400">
                Your shared profile looks more complete with one.
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-brand-link" />
          </button>
        ) : undefined
      }
    />
  );
}
