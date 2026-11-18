import { Link } from "wouter";
import { UserCheck } from "lucide-react";
import { useRetiredBy } from "@/hooks/useRetired";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

/**
 * On an owner's Current account: one line saying an older account of theirs
 * is Retired, for the reader who has met both and wonders which is real.
 * A line, not a banner: this page is the one everything else points to.
 */
export function CurrentAccountNote({ pubkey, className }: { pubkey: string | null | undefined; className?: string }) {
  const retired = useRetiredBy(pubkey);
  if (!retired) return null;
  return (
    <p
      role="note"
      className={cn("flex items-center gap-1.5 px-1 text-xs text-slate-500 dark:text-slate-400", className)}
      data-testid="current-account-note"
    >
      <UserCheck className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      <span>
        This is their current account.{" "}
        <Link
          href={`/p/${npubFromPubkey(retired.pubkey)}`}
          className="font-medium text-brand-link underline-offset-2 hover:underline"
          data-testid="current-account-retired-link"
        >
          An older account of theirs is retired
        </Link>
        .
      </span>
    </p>
  );
}
