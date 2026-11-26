import * as React from "react";
import { cn } from "@/lib/utils";

// ToggleChip — the pressable pill: a filter, a sort or a choice that is on or
// off (Open now, a category, Newest/Top, $$). Chip stays a span for tags and
// badges that do nothing when pressed; this is its button, with aria-pressed
// and the keyboard focus ring the hand-rolled ones lacked.
//
//   <ToggleChip pressed={openNow} onClick={toggle} count={3}>Open now</ToggleChip>
//   <ToggleChip variant="soft" pressed={…}>Today</ToggleChip>     // a facet row's tint
//   <ToggleChip variant="ghost" pressed={…}>Newest</ToggleChip>   // a sort, no border
//
// Purple marks the one that is on (p5: purple is for interaction). Layout stays
// the caller's: `className` merges over the defaults (twMerge), so a pill that
// holds an icon adds `inline-flex items-center gap-1.5`.

type Variant = "solid" | "soft" | "ghost";

const VARIANTS: Record<Variant, { on: string; off: string; count: (on: boolean) => string }> = {
  // Filled with Aurora Purple when on — the filters over a map or a list of places.
  solid: {
    on: "border border-brand-primary bg-brand-primary text-white",
    off: "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
    count: (on) => (on ? "text-white/80" : "text-slate-400"),
  },
  // A purple tint when on — the facet rows over search results.
  soft: {
    on: "border border-brand-primary bg-brand-primary/10 text-brand-deep dark:text-brand-link",
    off: "border border-slate-200 text-slate-600 hover:border-brand-accent/40 dark:border-slate-700 dark:text-slate-300",
    count: () => "opacity-60",
  },
  // Borderless, filled when on — a short row of sorts or a split beside a heading.
  ghost: {
    on: "bg-brand-primary font-semibold text-white",
    off: "font-semibold text-slate-500 hover:text-brand-primary dark:text-slate-400",
    count: () => "opacity-60",
  },
};

export interface ToggleChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  pressed: boolean;
  variant?: Variant;
  /** A number after the label (how many the filter leaves), read with it: "Open now 3". */
  count?: React.ReactNode;
}

export const ToggleChip = React.forwardRef<HTMLButtonElement, ToggleChipProps>(
  ({ pressed, variant = "solid", count, className, children, type = "button", ...props }, ref) => {
    const v = VARIANTS[variant];
    return (
      <button
        ref={ref}
        type={type}
        aria-pressed={pressed}
        className={cn(
          "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-default disabled:opacity-50",
          pressed ? v.on : v.off,
          className,
        )}
        {...props}
      >
        {children}
        {count != null && (
          <>
            {" "}
            <span className={v.count(pressed)}>{count}</span>
          </>
        )}
      </button>
    );
  },
);
ToggleChip.displayName = "ToggleChip";
