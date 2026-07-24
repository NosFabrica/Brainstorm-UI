import { type ReactNode } from "react";

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
  children,
  testId,
  className = "",
}: {
  icon: ReactNode;
  title: string;
  onViewAll?: () => void;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      data-testid={testId}
    >
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0 text-brand-deep">
          {icon}
        </div>
        <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="ml-auto text-xs font-semibold text-brand-link hover:underline shrink-0"
            data-testid="block-view-all"
          >
            View all →
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
