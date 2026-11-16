import { ShieldAlert } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useCompromised } from "@/hooks/useCompromised";
import { cn } from "@/lib/utils";

/**
 * Beside a person's name, wherever a person is shown: this account is
 * Compromised. Draws nothing for anyone else, so it can sit in every name row.
 * The word stays — a red icon alone says "something", not what.
 */
export function CompromisedMark({
  pubkey,
  size = "sm",
  className,
}: {
  pubkey: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  const status = useCompromised(pubkey);
  if (!status) return null;
  return (
    <Chip
      tone="danger"
      size={size}
      icon={ShieldAlert}
      className={cn("shrink-0 font-semibold", className)}
      title="Compromised: someone other than the owner controls this account"
      data-testid="compromised-mark"
    >
      Compromised
    </Chip>
  );
}
