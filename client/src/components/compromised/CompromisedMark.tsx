import { ShieldAlert, UserCheck } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { RetiredMark } from "@/components/retired/RetiredMark";
import { useCompromised, useReplaces } from "@/hooks/useCompromised";
import { cn } from "@/lib/utils";

/**
 * Beside a person's name, wherever a person is shown: this account is
 * Compromised — or it is the new account of an owner whose old one was, which
 * is the same story from the other end and what tells the two apart in a list.
 * Draws nothing for anyone else, so it can sit in every name row. The word
 * stays: a coloured icon alone says "something", not what.
 *
 * A Retired account's mark rides here too (components/retired), since this is
 * the mark every name row carries: Compromised first, when an account is both.
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
  const replaces = useReplaces(pubkey);
  if (status)
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
  if (replaces)
    return (
      <Chip
        tone="success"
        size={size}
        icon={UserCheck}
        className={cn("shrink-0 font-semibold", className)}
        title="The owner's new account: their old one was compromised"
        data-testid="successor-mark"
      >
        New account
      </Chip>
    );
  return <RetiredMark pubkey={pubkey} size={size} className={className} />;
}
