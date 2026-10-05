import { Check, CircleHelp, GitCompare } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Agreement } from "@/lib/conceptResolution";

/**
 * How the definition on screen relates to the community concept
 * (lib/conceptResolution): agrees, differs, or couldn't be compared. The
 * community's own definition has nothing to compare with, so no chip.
 */
export function AgreementChip({ agreement }: { agreement: Agreement }) {
  if (agreement === "agrees")
    return (
      <Chip tone="success" icon={Check} data-testid="chip-dictionary-agreement">
        Agrees with the community
      </Chip>
    );
  if (agreement === "differs")
    return (
      <Chip tone="warning" icon={GitCompare} data-testid="chip-dictionary-agreement">
        Differs from the community
      </Chip>
    );
  if (agreement === "unknown")
    return (
      <Chip tone="slate" icon={CircleHelp} data-testid="chip-dictionary-agreement">
        Community concept not found
      </Chip>
    );
  return null;
}
