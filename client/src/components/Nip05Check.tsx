import { BadgeCheck } from "lucide-react";
import { useNip05 } from "@/hooks/useNip05";

/**
 * The verified-handle check — drawn only once the handle's domain confirms it
 * belongs to this pubkey (lib/nip05). A bare kind-0 `nip05` is a claim anyone
 * can copy, so it never earns the badge on its own.
 */
export function Nip05Check({ nip05, pubkey, className }: { nip05?: string | null; pubkey?: string | null; className?: string }) {
  if (useNip05(nip05, pubkey) !== "verified") return null;
  return <BadgeCheck className={className} aria-label="Verified handle (NIP-05)" />;
}

/**
 * A handle line: the check when the domain confirms it, the bare text while
 * unconfirmed, and nothing when the domain names someone else.
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
  if (!nip05 || status === "invalid") return null;
  return (
    <span
      className={className}
      data-testid={testId}
      data-nip05-status={status}
      title={status === "verified" ? "Verified handle (NIP-05)" : "Handle not verified"}
    >
      {status === "verified" && <BadgeCheck className={iconClassName} />}
      <span className="truncate">{nip05.replace(/^_@/, "")}</span>
    </span>
  );
}
