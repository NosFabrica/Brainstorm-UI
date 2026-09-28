import { type ReactNode } from "react";
import { Link } from "wouter";

/**
 * Card shell for one content "teaser" section on the share page (Notes, Photos,
 * Articles, …). Clean white card + icon-chip header. Shows a small taste of
 * one content type with a "View all" affordance that points to opening the full
 * profile in a Nostr app — never a full feed.
 */
export function ContentTeaserBlock({
  icon,
  title,
  onViewAll,
  viewAllHref,
  viewAllLabel = "View all →",
  children,
  testId,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  onViewAll?: () => void;
  /** An in-app page with everything — rendered instead of the button. */
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-brand-deep shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          {icon}
        </div>
        <h2
          className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="ml-auto shrink-0 text-xs font-semibold text-brand-link hover:underline"
            data-testid="block-view-all"
          >
            {viewAllLabel}
          </Link>
        ) : (
          onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="ml-auto shrink-0 text-xs font-semibold text-brand-link hover:underline"
              data-testid="block-view-all"
            >
              View all →
            </button>
          )
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
