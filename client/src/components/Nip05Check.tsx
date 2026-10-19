import { Link } from "wouter";
import { AlertTriangle, BadgeCheck } from "lucide-react";
import { useHandleOwner, useNip05 } from "@/hooks/useNip05";
import { npubFromPubkey } from "@/lib/shareId";

/**
 * The verified-handle check — drawn only once the handle's domain confirms it
 * belongs to this pubkey (lib/nip05). A bare kind-0 `nip05` is a claim anyone
 * can copy, so it never earns the badge on its own.
 */
export function Nip05Check({
  nip05,
  pubkey,
  className,
}: {
  nip05?: string | null;
  pubkey?: string | null;
  className?: string;
}) {
  if (useNip05(nip05, pubkey) !== "verified") return null;
  return <BadgeCheck className={className} aria-label="Verified handle (NIP-05)" />;
}

/**
 * A handle line, shown only once the handle's domain confirms it belongs to
 * this pubkey: anything on screen is true. While it's being asked, when the
 * domain can't be reached, or when it doesn't list the name, nothing — those
 * failures are common and say nothing. A handle the domain gives to someone
 * else is HandleOwnerWarning's to say.
 */
export function Nip05Handle({
  nip05,
  pubkey,
  className,
  iconClassName,
  testId,
}: {
  nip05?: string | null;
  pubkey?: string | null;
  className?: string;
  iconClassName?: string;
  testId?: string;
}) {
  const status = useNip05(nip05, pubkey);
  if (!nip05 || status !== "verified") return null;
  return (
    <span className={className} data-testid={testId} data-nip05-status={status} title="Verified handle (NIP-05)">
      <BadgeCheck className={iconClassName} />
      <span className="truncate">{nip05.replace(/^_@/, "")}</span>
    </span>
  );
}

/**
 * The one handle failure worth saying out loud: the handle's own server names
 * a different account, so this profile is using someone else's handle — often
 * a copy of their profile. The handle crossed out, and a link to the account
 * it belongs to. Nothing at all for the common failures (lib/nip05
 * handleOwner). `compact` for a search row: one line, the link stops the row's
 * own click. `linked={false}` where the row itself is a choice (the search
 * dropdown's options): the words without the link.
 */
export function HandleOwnerWarning({
  nip05,
  pubkey,
  compact = false,
  linked = true,
  className = "",
}: {
  nip05?: string | null;
  pubkey?: string | null;
  compact?: boolean;
  linked?: boolean;
  className?: string;
}) {
  const owner = useHandleOwner(nip05, pubkey);
  if (!owner || !nip05) return null;
  const handle = nip05.replace(/^_@/, "");
  return (
    <p
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-amber-700 dark:text-amber-400 ${compact ? "text-xs" : "text-sm"} ${className}`}
      data-testid="handle-owner-warning"
      role="note"
    >
      <AlertTriangle className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0`} aria-hidden="true" />
      <span>
        <s>{handle}</s> belongs to another account
      </span>
      {linked && (
        <Link
          href={`/p/${npubFromPubkey(owner)}`}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300"
        >
          See that account
        </Link>
      )}
    </p>
  );
}
