import { Link } from "wouter";
import { Archive, ArrowRight } from "lucide-react";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { npubFromPubkey } from "@/lib/shareId";
import { cn } from "@/lib/utils";
import { retiredStatus } from "@/services/retired";

/**
 * In a conversation with a Retired account: a quiet bar under the chat's
 * header saying the owner may not see what is sent here, with their Current
 * account to message instead. In a group it names who, and offers no link: a
 * one-to-one chat with their other account is a different conversation.
 * Nothing in a chat with nobody retired.
 */
export function RetiredChatNote({ pubkeys, className }: { pubkeys: string[]; className?: string }) {
  const found = pubkeys.flatMap((pk) => retiredStatus(pk) ?? []);
  const profiles = useLiveProfiles(found.map((s) => s.pubkey));
  if (found.length === 0) return null;
  const nameOf = (pk: string) =>
    profiles.get(pk)?.display_name || profiles.get(pk)?.name || `${npubFromPubkey(pk).slice(0, 12)}…`;
  const group = pubkeys.length > 1;
  return (
    <div
      role="note"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 sm:px-5",
        className,
      )}
      data-testid="retired-chat-note"
    >
      <Archive className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <p className="min-w-0 flex-1 basis-56 text-xs leading-relaxed">
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          {group
            ? `${found.map((s) => nameOf(s.pubkey)).join(", ")} ${found.length > 1 ? "are" : "is"} on a retired account.`
            : "This account is retired."}
        </span>{" "}
        {group ? "They may not see messages sent here." : "Its owner may not see messages sent here."}
      </p>
      {!group && (
        <Link
          href={`/messages/${npubFromPubkey(found[0].currentPubkey)}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-link underline-offset-2 hover:underline"
          data-testid="retired-chat-current"
        >
          Message their current account <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
