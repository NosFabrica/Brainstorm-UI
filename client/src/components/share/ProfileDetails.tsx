import { Check, Copy, Globe } from "lucide-react";
import { FlashIcon } from "@/components/FlashIcon";
import { ExternalIdentities } from "@/components/share/ExternalIdentities";
import { useCopied } from "@/hooks/useCopied";
import type { ExternalIdentity } from "@/lib/externalIdentity";
import { lightningTarget, websiteLinks } from "@/lib/profileFacts";

/**
 * The facts a profile states about itself, as one-line rows under the bio:
 * where its website is, how to pay it, which accounts it links. Facts read
 * as text — the icon-only glyphs that sat top-right were the complaint
 * (2026-09-05: "hard to find … I wanted to copy the lightning address").
 * A tap on the address copies it; "Zap" beside it hands off to the caller's
 * pay flow, only when that flow can resolve the target (LUD-16). The block
 * is absent when the profile states nothing. Website and lightning are not
 * personalization keys on purpose: the owner controls them by editing
 * their profile; linked accounts stay hideable, so the caller passes none.
 */
export function ProfileDetails({
  website,
  lud16,
  lud06,
  identities = [],
  onZap,
  className = "",
}: {
  website?: unknown;
  lud16?: unknown;
  lud06?: unknown;
  identities?: ExternalIdentity[];
  onZap?: () => void;
  className?: string;
}) {
  const links = websiteLinks(website);
  const lightning = lightningTarget(lud16, lud06);
  const { copied, copy } = useCopied();
  if (links.length === 0 && !lightning && identities.length === 0) return null;
  const row = "flex items-center gap-1.5 min-w-0 text-xs text-slate-600 dark:text-slate-300";
  return (
    <div className={`mt-2 space-y-1 ${className}`} data-testid="share-details">
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" title={l.full} className={`${row} hover:text-brand-link transition-colors`} data-testid="share-website">
          <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
          <span className="truncate">{l.label}</span>
        </a>
      ))}
      {lightning && (
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => void copy(lightning.address)}
            title="Copy lightning address"
            aria-label="Copy lightning address"
            className={`group ${row} text-left hover:text-slate-900 dark:hover:text-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded`}
            data-testid="share-lightning"
          >
            <FlashIcon className="h-3.5 w-3.5 shrink-0 text-[#F7931A]" />
            <span className="truncate font-mono text-[11px]" title={lightning.address}>{lightning.display}</span>
            {copied ? (
              <Check className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" aria-hidden="true" />
            )}
            <span className="sr-only" aria-live="polite" data-testid="share-lightning-copied">{copied ? "Copied" : ""}</span>
          </button>
          {onZap && lightning.zappable && (
            <button
              type="button"
              onClick={onZap}
              className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#e07f12] transition-colors"
              data-testid="share-lightning-zap"
            >
              Zap
            </button>
          )}
        </div>
      )}
      {identities.length > 0 && (
        <div className="space-y-1" data-testid="share-identities">
          <ExternalIdentities identities={identities} />
        </div>
      )}
    </div>
  );
}
