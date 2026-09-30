import { nip19 } from "nostr-tools";
import { Check, BadgeCheck } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initialsFor } from "@/lib/profileDefaults";
import { useNip05 } from "@/hooks/useNip05";

export type PersonLite = { pubkey: string; name?: string; nip05?: string; picture?: string };

/**
 * A selectable person row: avatar, name, and a follow/added toggle. Shared by the
 * /welcome onboarding and the dashboard's no-follows follow-picker.
 */
export function PersonRow({
  person,
  selected,
  onToggle,
}: {
  person: PersonLite;
  selected: boolean;
  onToggle: () => void;
}) {
  const nip05Status = useNip05(person.nip05, person.pubkey);
  const name = person.name || (person.pubkey ? nip19.npubEncode(person.pubkey).slice(0, 12) + "…" : "Unknown");
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {person.picture ? <AvatarImage src={person.picture} alt={name} className="object-cover" /> : null}
        <AvatarFallback className="rounded-full bg-brand-primary/15 text-sm font-bold text-brand-primary">
          {initialsFor(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
          {nip05Status === "verified" && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
        </div>
        {person.nip05 && nip05Status !== "invalid" && (
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">{person.nip05}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
          selected
            ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
            : "border border-slate-300 text-slate-700 hover:border-brand-primary hover:text-brand-primary dark:border-slate-700 dark:text-slate-200"
        }`}
        data-testid={`person-toggle-${person.pubkey.slice(0, 8)}`}
      >
        {selected ? (
          <>
            <Check className="h-4 w-4" /> Following
          </>
        ) : (
          "Follow"
        )}
      </button>
    </div>
  );
}
