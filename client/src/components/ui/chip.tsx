import * as React from "react";
import { cn } from "@/lib/utils";
import { tone as resolveTone, type Tone } from "@/lib/tones";

// Chip — the tinted pill used for tags, status badges and small counts
// (brand guidelines p17 "Tags & Badges": Identity/Nostr/Web-of-Trust chips,
// and ✓Verified / ●Trusted / ●Member status badges). One tone prop drives the
// light + dark treatment via lib/tones.
//
//   <Chip tone="emerald" icon={Check}>Verified</Chip>
//   <Chip tone="slate" dot>Member</Chip>
//   <Chip tone="success">Saved</Chip>            // semantic alias

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: "sm" | "md";
  /** Leading icon component (lucide-style). */
  icon?: React.ComponentType<{ className?: string }>;
  /** Show a solid status dot in the tone color. */
  dot?: boolean;
}

export function Chip({ tone = "slate", size = "md", icon: Icon, dot = false, className, children, ...props }: ChipProps) {
  const c = resolveTone(tone);
  const sizeCls =
    size === "sm"
      ? "text-[10px] px-1.5 py-0.5 gap-0.5"
      : "text-xs px-2 py-0.5 gap-1";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border font-medium leading-none",
        sizeCls,
        c.bg,
        c.text,
        c.border,
        className,
      )}
      {...props}
    >
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", c.dot)} />}
      {Icon && <Icon className={cn(iconSize, "shrink-0")} />}
      {children}
    </span>
  );
}
