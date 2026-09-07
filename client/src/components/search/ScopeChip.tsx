import { X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DefaultAvatarImg } from "@/components/share/DefaultAvatarImg";
import { useProfileMap } from "@/hooks/useProfileMap";
import { getDisplayLabel } from "@/lib/profileSearch";

/**
 * The person a search is scoped to, in the box: their face and name where the
 * grammar has `from:npub…`. The token stays in the URL — the relay's language
 * — but nobody reads a key (Benjamin: "we should never show the raw scope").
 * Words typed beside the chip search within their posts; the X drops the
 * scope. Until the profile answers, a quiet placeholder — never the key.
 */
export function ScopeChip({ pubkey, onRemove }: { pubkey: string; onRemove: () => void }) {
  const profiles = useProfileMap([pubkey]);
  const person = profiles.get(pubkey);
  const name = person ? getDisplayLabel(person) : null;
  return (
    <span
      className="inline-flex max-w-[55%] shrink-0 items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 py-0.5 pl-0.5 pr-1.5 text-sm text-slate-800 dark:text-slate-100"
      data-testid="search-scope-chip"
    >
      <Avatar className="h-6 w-6 shrink-0">
        {person?.picture ? <AvatarImage src={person.picture} alt="" className="object-cover" /> : null}
        <AvatarFallback className="overflow-hidden">
          <DefaultAvatarImg />
        </AvatarFallback>
      </Avatar>
      {name ? (
        <span className="truncate font-medium">{name}</span>
      ) : (
        <span className="h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" aria-label="Loading who this is" />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={name ? `Remove ${name}` : "Remove person"}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
        data-testid="search-scope-remove"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
