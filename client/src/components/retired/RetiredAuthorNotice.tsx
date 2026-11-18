import { Link } from "wouter";
import { Archive, ArrowRight } from "lucide-react";
import { useRetired } from "@/hooks/useRetired";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

/**
 * Under the byline of a post, article or item by a Retired account: one calm
 * line saying where it is from and where its owner is now. The post is theirs
 * and stands as it was; the line is for the reader about to reply or follow.
 */
export function RetiredAuthorNotice({ pubkey, className }: { pubkey: string | null | undefined; className?: string }) {
  const status = useRetired(pubkey);
  if (!status) return null;
  return (
    <div
      role="note"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300",
        className,
      )}
      data-testid="retired-author-notice"
    >
      <Archive className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold text-slate-800 dark:text-slate-100">Posted from a retired account.</span> Its
        owner posts from another account now.
      </p>
      <Link
        href={`/p/${npubFromPubkey(status.currentPubkey)}`}
        className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-link underline-offset-2 hover:underline"
        data-testid="retired-author-current"
      >
        Their current account <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
