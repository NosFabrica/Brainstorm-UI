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
}: {
  pubkey: string;
  npub?: string;
  name?: string;
  picture?: string;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const resolvedNpub = useMemo(() => npub || encodeNpub(pubkey), [npub, pubkey]);
  const [imgOk, setImgOk] = useState(true);
  const clickable = typeof onClick === "function";

  return (
    <div
      className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all ${
        active
          ? "border-brand-accent/40 bg-indigo-50/40"
          : "border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80"
      } ${clickable ? "cursor-pointer hover:border-brand-accent/30 hover:bg-indigo-50/10" : ""}`}
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
      data-testid={`user-row-${pubkey.slice(0, 8)}`}
    >
      {picture && imgOk ? (
        <img
          src={picture}
          alt=""
          className="h-8 w-8 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-800"
          onError={() => setImgOk(false)}
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-accent/20 to-brand-deep/20 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-brand-deep/60" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
          {name || "Unknown"}
        </p>
        <p
          className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate"
          title={resolvedNpub}
        >
          {shortNpub(resolvedNpub)}
        </p>
        {subtitle && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{subtitle}</p>
        )}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
    </div>
  );
}
