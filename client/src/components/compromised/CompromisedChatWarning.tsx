import { Link } from "wouter";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { useCompromisedAmong } from "@/hooks/useCompromised";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { displayNameOf } from "@/lib/displayName";

/**
 * In a conversation with a Compromised account — the place the damage is
 * done, because a message from someone you trust asking for money is the
 * whole point of taking their key.
 *
 * Two placements. `thread`: a bar under the chat's header that doesn't
 * scroll away or dismiss, saying it and offering the owner's new account to
 * message instead. `composer`: one line above the box where the reply (or the
 * payment) would be written. Nothing in a chat with nobody compromised.
 */
export function CompromisedChatWarning({
  pubkeys,
  placement = "thread",
  className,
}: {
  /** The other people in the chat. */
  pubkeys: string[];
  placement?: "thread" | "composer";
  className?: string;
}) {
  const found = useCompromisedAmong(pubkeys);
  const profiles = useLiveProfiles(found.map((s) => s.pubkey));
  if (found.length === 0) return null;
  const nameOf = (pk: string) => displayNameOf(profiles.get(pk), pk, "npub12");

  if (placement === "composer")
    return (
      <p
        className={cn(
          "flex items-center gap-2 border-t border-red-300 bg-red-50 px-4 py-2 text-xs font-medium text-red-900 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-100",
          className,
        )}
        data-testid="compromised-chat-reminder"
      >
        <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span>
          <span className="font-bold">Compromised account.</span> Don't send money, codes or anything private here.
        </span>
      </p>
    );

  const group = pubkeys.length > 1;
  const successor = found.length === 1 ? found[0].successorPubkey : null;
  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-red-600 bg-red-600 px-4 py-3 text-white dark:border-red-500 dark:bg-red-600 sm:px-5",
        className,
      )}
      data-testid="compromised-chat-warning"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30"
        aria-hidden="true"
      >
        <ShieldAlert className="h-5 w-5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-sm font-bold leading-snug">
          {group
            ? `Someone in this chat is compromised: ${found.map((s) => nameOf(s.pubkey)).join(", ")}`
            : "You're messaging a compromised account"}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/90">
          Someone other than the owner can read and answer here. Don't send money, codes or anything private, and don't
          trust links.
        </p>
      </div>
      {successor && (
        <Link
          href={`/messages/${npubFromPubkey(successor)}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700 shadow-sm transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-red-600"
          data-testid="compromised-chat-successor"
        >
          Message their new account <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
