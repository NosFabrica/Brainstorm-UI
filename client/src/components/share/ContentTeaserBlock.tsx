import { type ReactNode } from "react";

/**
 * Card shell for one content "teaser" section on the share page (Notes, Photos,
 * Articles, …). On-brand glass card + icon-chip header. Shows a small taste of
 * one content type with a "View all" affordance that points to opening the full
 * profile in a Nostr app — never a full feed.
 */
export function ContentTeaserBlock({
  icon,
  title,
  onViewAll,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  onViewAll?: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="rounded-2xl bg-gradient-to-br from-white/95 via-white/80 to-indigo-50/40 backdrop-blur-xl border border-[#7c86ff]/20 shadow-[0_0_15px_rgba(124,134,255,0.07)] overflow-hidden"
      data-testid={testId}
    >
      <div className="h-1 w-full bg-gradient-to-r from-[#7c86ff] via-[#333286] to-[#7c86ff]" />
      <div className="px-5 py-4 border-b border-[#7c86ff]/10 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-white border border-slate-100 shadow-sm ring-1 ring-slate-100 flex items-center justify-center shrink-0 text-[#333286]">
          {icon}
        </div>
        <h2 className="text-sm font-bold text-slate-900 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          {title}
        </h2>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="ml-auto text-xs font-semibold text-[#3730a3] hover:underline shrink-0"
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
