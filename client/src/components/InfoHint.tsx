import { type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface InfoHintProps {
  /** Plain-language explanation shown in the popover. */
  children: ReactNode;
  /** Accessible label for the trigger button. Defaults to "More info". */
  label?: string;
}

/**
 * A small circular info button that reveals a plain-language explanation of a
 * term. Built on Popover so it opens on tap and keyboard (reliable on touch
 * devices) — the global TooltipProvider already covers hover. Used to gloss the
 * unavoidable crypto terms (npub, recovery key, NIP-05, …) without leaving them
 * unexplained for mainstream users.
 */
export function InfoHint({ children, label = "More info" }: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-11 w-11 -my-2.5 items-center justify-center text-slate-400 hover:text-brand-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded-full"
          data-testid="button-info-hint"
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[260px] p-3 rounded-xl border-brand-accent/20 bg-white text-[13px] leading-relaxed text-slate-600 shadow-lg"
        data-testid="popover-info-hint"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
