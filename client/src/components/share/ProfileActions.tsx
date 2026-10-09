import type { ReactNode } from "react";
import { Link } from "wouter";
import { MessageCircle } from "lucide-react";

/**
 * The actions beside a profile's avatar: Message, Follow and the ⋯ menu.
 *
 * It used to be five things — a magnifier, a pen, a speech bubble, Follow and
 * ⋯ — and the three icons had no words. Nobody could tell the pen was "write
 * a review" (Benjamin, 2026-10-09). What every social product keeps visible
 * is the primary action and one secondary, labelled; the rest goes behind ⋯.
 * So: Follow stays the button it was, Message gets its word, and the review
 * and post search moved into the menu as rows that say what they do
 * (ProfileMenu).
 *
 * Two placements, same pieces. Desktop: all three top-right beside the
 * avatar. Phone: Message and ⋯ across from the avatar in the slot under the
 * banner; Follow keeps the full-width row of its own the page gives it below
 * the identity, so the primary button can stretch.
 */
export function ProfileActions({
  viewer,
  npub,
  displayName,
  follow,
  menu,
}: {
  viewer: { loggedIn: boolean; isOwner: boolean };
  npub: string;
  displayName: string;
  /** The Follow control, or null when there is nothing to follow (signed out, own page). */
  follow: ReactNode;
  menu: ReactNode;
}) {
  const message =
    viewer.loggedIn && !viewer.isOwner ? (
      <Link
        href={`/messages/${npub}`}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-link dark:hover:text-brand-link"
        title={`Message ${displayName}`}
        data-testid="share-message"
      >
        <MessageCircle className="h-4 w-4" />
        Message
      </Link>
    ) : null;

  return (
    <>
      <div className="hidden shrink-0 items-center gap-2 sm:flex" data-testid="share-actions-topright">
        {message}
        {follow}
        {menu}
      </div>
      <div className="flex items-center gap-2 sm:hidden" data-testid="share-actions-mobile-top">
        {message}
        {menu}
      </div>
    </>
  );
}
