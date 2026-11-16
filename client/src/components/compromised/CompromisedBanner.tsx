import { Link } from "wouter";
import { ArrowRight, ShieldAlert } from "lucide-react";
import type { CompromisedStatus } from "@/lib/compromised";
import { eventPath } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { CompromisedActions } from "./CompromisedActions";
import { SuccessorCard } from "./SuccessorCard";

/**
 * The warning a Compromised account's own page leads with.
 *
 * Louder than the Flagged banner on purpose: Flagged reports what other people
 * said and leaves the reader to judge; Compromised is a fact about the key, and
 * the reader's money and trust are what the new holder is after. So it states
 * the fact, says what not to do, shows the way out — the owner's new account,
 * to follow from here — lets a reader drop and report the old one, and points
 * at the proof: the owner's own post.
 */
// In UTC: the day is a fact about the account, and a reader west of UTC must not be told the day before.
const DAY = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export const compromisedDay = (since: number) => DAY.format(new Date(since * 1000));

export function CompromisedBanner({ status, className }: { status: CompromisedStatus; className?: string }) {
  const proofHref = status.proofEventId ? eventPath({ id: status.proofEventId, pubkey: status.pubkey }) : null;
  return (
    <section
      role="alert"
      aria-labelledby="compromised-title"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-red-300 bg-red-50 shadow-sm dark:border-red-500/40 dark:bg-red-950/40",
        className,
      )}
      data-testid="compromised-banner"
    >
      <span className="absolute inset-y-0 left-0 w-1.5 bg-red-600 dark:bg-red-500" aria-hidden="true" />
      <div className="flex items-start gap-3.5 py-4 pl-6 pr-4 sm:gap-4 sm:py-5 sm:pl-7 sm:pr-6">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm dark:bg-red-500 sm:h-11 sm:w-11"
          aria-hidden="true"
        >
          <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="compromised-title"
            className="text-base font-bold leading-snug tracking-tight text-red-900 dark:text-red-100 sm:text-lg"
            style={{ fontFamily: "var(--font-display)" }}
          >
            This account is compromised
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-red-900/85 dark:text-red-100/85">
            Someone other than its owner controls it now. New posts, messages and payment requests from this account may
            not be from the person you know. Don't send it money, and don't trust links it sends you.
          </p>
          {status.successorPubkey && (
            <SuccessorCard
              pubkey={status.successorPubkey}
              announcementId={status.successorEventId}
              className="mt-3.5"
            />
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CompromisedActions pubkey={status.pubkey} />
            {proofHref && (
              <Link
                href={proofHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition-colors hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-100 dark:hover:bg-red-900/60"
                data-testid="compromised-proof"
              >
                Read the owner's post <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
          {status.since !== null && (
            <p className="mt-2.5 text-xs text-red-800/70 dark:text-red-200/60" data-testid="compromised-since">
              Compromised since {compromisedDay(status.since)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
