import * as React from "react";
import { cn } from "@/lib/utils";

// SectionHeader — the Aurora-cyan mono kicker used to label a section
// (matches the "TRUST OVER NOISE" / "THE PIPELINE" / "IDENTITY" kickers across
// the app). Uppercase mono in brand-accent with a fading hairline.
//
//   <SectionHeader kicker="Identity" icon={UserRound} />

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  kicker: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Hide the trailing hairline rule. */
  noRule?: boolean;
}

export function SectionHeader({ kicker, icon: Icon, noRule = false, className, ...props }: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-brand-accent" />}
      <span className="text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-brand-accent">{kicker}</span>
      {!noRule && <span className="h-px flex-1 bg-gradient-to-r from-brand-accent/25 to-transparent" />}
    </div>
  );
}
