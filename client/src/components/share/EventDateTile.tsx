import { eventDateTile } from "@/lib/calendarEvent";

/**
 * The calendar "date tile" — short month over day-of-month — used wherever an
 * event is listed (profile page rows, Events tab cards, the knowledge panel).
 * Brand-tinted while the event is still to come, grey once it is over. Dark
 * grounds use the primary tint, never bg-brand-deep (design-system.md).
 */
export function EventDateTile({ startSec, past = false, size = "md", testId }: { startSec: number; past?: boolean; size?: "sm" | "md"; testId?: string }) {
  const tile = startSec ? eventDateTile(startSec) : null;
  const box = size === "sm" ? "h-9 w-9 rounded-md" : "h-12 w-12 rounded-lg";
  const tone = past
    ? "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500"
    : "border-brand-accent/30 dark:border-brand-accent/25 bg-brand-primary/[0.06] dark:bg-brand-primary/[0.15] text-brand-deep dark:text-brand-link";
  return (
    <span className={`flex ${box} shrink-0 flex-col items-center justify-center border ${tone}`} aria-hidden="true" data-testid={testId}>
      {tile ? (
        <>
          <span className={`${size === "sm" ? "text-[8px]" : "text-[9px]"} font-bold uppercase leading-none tracking-wide`}>{tile.month}</span>
          <span className={`${size === "sm" ? "text-sm" : "text-lg"} font-bold leading-tight tabular-nums`}>{tile.day}</span>
        </>
      ) : (
        <span className="text-[9px] font-bold uppercase leading-none tracking-wide">TBA</span>
      )}
    </span>
  );
}
