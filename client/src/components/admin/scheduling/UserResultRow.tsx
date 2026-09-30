import { useMemo, useState } from "react";
import { User } from "lucide-react";
import { nip19 } from "nostr-tools";

function encodeNpub(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

function shortNpub(npub: string): string {
  if (npub.length <= 24) return npub;
  return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
}

/**
 * A compact, reusable user row — avatar + display name + short npub — used by
 * the assign-users search results, the staging tray, and the enriched
 * assigned-users list. Purely presentational; callers supply the trailing slot
 * (add button, remove button, tier picker, last-published, …).
 */
export function UserResultRow({
  pubkey,
  npub,
  name,
  picture,
  subtitle,
  trailing,
  onClick,
  active,
  testId,
}: {
  pubkey: string;
  npub?: string;
  name?: string;
  picture?: string;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  /** Lets a caller address one row in tests without wrapping it. */
  testId?: string;
}) {
  const resolvedNpub = useMemo(() => npub || encodeNpub(pubkey), [npub, pubkey]);
  const [imgOk, setImgOk] = useState(true);
  const clickable = typeof onClick === "function";

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border p-2 transition-all ${
        active
          ? "border-brand-accent/40 bg-brand-primary/10 dark:bg-brand-primary/10"
          : "border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/80"
      } ${clickable ? "cursor-pointer hover:border-brand-accent/30 hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10" : ""}`}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      data-testid={testId ?? `user-row-${pubkey.slice(0, 8)}`}
    >
      {picture && imgOk ? (
        <img
          src={picture}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-800"
          onError={() => setImgOk(false)}
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20">
          <User className="h-4 w-4 text-brand-deep/60" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{name || "Unknown"}</p>
        <p className="truncate font-mono text-[10px] text-slate-400 dark:text-slate-500" title={resolvedNpub}>
          {shortNpub(resolvedNpub)}
        </p>
        {subtitle && <p className="truncate text-[10px] text-slate-400 dark:text-slate-500">{subtitle}</p>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
    </div>
  );
}
