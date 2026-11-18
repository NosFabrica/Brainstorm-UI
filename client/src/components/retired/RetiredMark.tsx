import { Archive } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useRetired } from "@/hooks/useRetired";
import { cn } from "@/lib/utils";

/**
 * Beside a person's name, wherever a person is shown: this account is Retired.
 * Neutral, where the Compromised mark is red: it tells two accounts with one
 * name apart without saying anything is wrong. Draws nothing for anyone else,
 * the owner's Current account included: that one is simply them.
 */
export function RetiredMark({
  pubkey,
  size = "sm",
  className,
}: {
  pubkey: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!useRetired(pubkey)) return null;
  return (
    <Chip
      tone="slate"
      size={size}
      icon={Archive}
      className={cn("shrink-0 font-semibold", className)}
      title="Retired: its owner no longer uses this account"
      data-testid="retired-mark"
    >
      Retired
    </Chip>
  );
}
