import { Link } from "wouter";
import { ArrowRight, UserCheck } from "lucide-react";
import type { CompromisedStatus } from "@/lib/compromised";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { compromisedDay } from "./CompromisedBanner";

/**
 * On an owner's new account: why a familiar name has a new key, few followers
 * and no score yet. Without it the real account reads as the copy.
 */
export function ReplacesBanner({ replaces, className }: { replaces: CompromisedStatus; className?: string }) {
  return (
    <section
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-950/30 sm:px-5",
        className,
      )}
      role="note"
      data-testid="replaces-banner"
    >
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white dark:bg-emerald-500"
        aria-hidden="true"
      >
        <UserCheck className="h-4 w-4" />
      </span>
      <div className="min-w-0 text-sm leading-relaxed text-emerald-950 dark:text-emerald-100">
        <p className="font-bold">The owner's new account</p>
        <p className="text-emerald-900/85 dark:text-emerald-100/80">
          This account replaces one that was compromised
          {replaces.since !== null ? ` on ${compromisedDay(replaces.since)}` : ""}. It is new, so its followers and
          score are starting over.{" "}
          <Link
            href={`/p/${npubFromPubkey(replaces.pubkey)}`}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300"
            data-testid="replaces-old-link"
          >
            See the old account <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </p>
      </div>
    </section>
  );
}
