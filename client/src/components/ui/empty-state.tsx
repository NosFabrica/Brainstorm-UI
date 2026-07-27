import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Glyph in the Aurora-tinted disc. Defaults to an inbox. */
  icon?: LucideIcon;
  title: string;
  /** One supporting line — what's missing and, ideally, the next step. */
  description?: string;
  /** Optional CTA (a Button / link) rendered under the copy. */
  action?: ReactNode;
  /** Tighter padding for inline placement inside a card or section. */
  compact?: boolean;
  className?: string;
}

/**
 * The branded "nothing here yet" block — a soft Aurora-tinted icon disc over a
 * faint radial glow, a title, an optional hint, and an optional CTA. One shared
 * treatment so empty search results, empty profiles, and empty panels all read
 * the same on the p5 palette (purple = the brand's focus colour) instead of the
 * ad-hoc grey lines they used to be.
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div
      className={cn("mx-auto flex max-w-sm flex-col items-center text-center", compact ? "py-8" : "py-14", className)}
      data-testid="empty-state"
    >
      <div className="relative mb-4">
        {/* Faint Aurora glow so the disc reads as brand, not chrome. */}
        <div className="pointer-events-none absolute inset-0 -z-10 mx-auto my-auto h-16 w-16 rounded-full bg-brand-primary/20 blur-2xl" aria-hidden="true" />
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/15 dark:ring-brand-primary/25">
          <Icon className="h-7 w-7" strokeWidth={1.75} />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
