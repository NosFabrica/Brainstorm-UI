/**
 * "Message" wherever a person is shown: opens (or starts) the private chat
 * with them. Only for a signed-in reader, and never for themselves.
 */
import { Link } from "wouter";
import { MessageCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useDmEngine } from "@/hooks/useDirectMessages";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";

export function messageHref(pubkey: string): string {
  return `/messages/${npubFromPubkey(pubkey)}`;
}

export function MessageButton({
  pubkey,
  name,
  compact = false,
  className,
}: {
  pubkey: string;
  /** For the accessible label when `compact`. */
  name?: string;
  /** Icon only. */
  compact?: boolean;
  className?: string;
}) {
  const me = useDmEngine()?.pubkey;
  if (!me || !pubkey || pubkey === me) return null;
  const label = name ? `Message ${name}` : "Message";
  return (
    <Link
      href={messageHref(pubkey)}
      onClick={(e) => e.stopPropagation()}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(
        buttonVariants({ variant: "outline", size: compact ? "icon" : "sm" }),
        compact ? "h-8 w-8" : "h-8 px-3 text-xs",
        className,
      )}
      data-testid="button-message"
    >
      <MessageCircle className="h-3.5 w-3.5" />
      {!compact && "Message"}
    </Link>
  );
}
