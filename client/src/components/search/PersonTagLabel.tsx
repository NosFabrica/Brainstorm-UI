import { Tag } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The matched tag on a person's row in the search popup — said quietly. Grey
 * text with a small tag icon, the same grey as the tag row's "Tag · 98
 * people" line above it, so the eye links the two without a pill competing
 * with the name (the team, 2026-10-01: visible, but subtler).
 *
 * A label, not a control: the tag row is the way to the tag page, and a
 * second tap target inside a row that opens the person is easy to mis-tap.
 * The name gives way first — it is clipped here and spelled out in full on
 * the tag row — and a phone row keeps only the icon.
 */
export function PersonTagLabel({ name, className }: { name: string; className?: string }) {
  return (
    <span
      title={`Tagged ${name}`}
      aria-label={`Tagged ${name}`}
      className={cn(
        "inline-flex min-w-0 max-w-[11rem] shrink items-center gap-1 text-xs text-slate-500 dark:text-slate-400",
        className,
      )}
      data-testid="person-tag-label"
    >
      <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="hidden truncate sm:inline">{name}</span>
    </span>
  );
}
