import { Link } from "wouter";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useCompromised } from "@/hooks/useCompromised";
import { contentStanding } from "@/lib/compromised";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

/**
 * Under the byline of a post, article or item by a Compromised account.
 *
 * It tells the two kinds of content apart, because both stay readable: what
 * the owner posted before the key changed hands is still theirs and still
 * worth reading, so that gets a calm line; what came after may be anyone's,
 * so that gets the warning. The owner's own post about it is a compromised
 * post like the rest — the key was already taken — and is named as the one
 * where they said so. Either way the new account is one click away.
 */
export function CompromisedAuthorNotice({
  pubkey,
  postedAt,
  eventId,
  className,
}: {
  pubkey: string | null | undefined;
  /** The content's created_at, epoch seconds. */
  postedAt?: number;
  /** The content's id: the post that proves the compromise is the owner's own, and says so. */
  eventId?: string;
  className?: string;
}) {
  const status = useCompromised(pubkey);
  if (!status) return null;
  const standing = contentStanding(status, { postedAt, eventId });
  const isProof = standing === "proof";
  const before = standing === "before";
  return (
    <div
      role={before ? "note" : "alert"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed",
        before
          ? "border-red-200 bg-red-50/60 text-red-900/85 dark:border-red-500/25 dark:bg-red-950/20 dark:text-red-100/80"
          : "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100",
        className,
      )}
      data-testid="compromised-author-notice"
    >
      <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {isProof ? (
          <>
            <span className="font-bold">Posted from a compromised account.</span> In this post the owner says their
            account was compromised. Don't send money or trust links from it.
          </>
        ) : before ? (
          <>
            <span className="font-bold">Posted before this account was compromised.</span> The account is no longer in
            its owner's hands, so be careful with anything newer from it.
          </>
        ) : (
          <>
            <span className="font-bold">Posted after this account was compromised.</span> It may not be from the owner.
            Don't send money or trust links from it.
          </>
        )}
      </p>
      {status.successorPubkey && (
        <Link
          href={`/p/${npubFromPubkey(status.successorPubkey)}`}
          className="inline-flex shrink-0 items-center gap-1 font-semibold text-red-800 underline underline-offset-2 hover:text-red-950 dark:text-red-100 dark:hover:text-white"
          data-testid="compromised-author-successor"
        >
          Owner's new account <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
