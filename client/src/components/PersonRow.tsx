import { nip19 } from "nostr-tools";
import { Check, BadgeCheck } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initialsFor } from "@/lib/profileDefaults";

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
  const name = person.name || (person.pubkey ? nip19.npubEncode(person.pubkey).slice(0, 12) + "…" : "Unknown");
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar className="h-10 w-10 rounded-full bg-white border border-slate-200 shrink-0">
        {person.picture ? <AvatarImage src={person.picture} alt={name} className="object-cover" /> : null}
        <AvatarFallback className="rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-slate-900 truncate">{name}</span>
          {person.nip05 && <BadgeCheck className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
        </div>
        {person.nip05 && <p className="text-xs text-slate-400 truncate">{person.nip05}</p>}
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-sm font-semibold transition-colors ${
          selected
            ? "bg-brand-primary text-white hover:bg-brand-primary-hover"
            : "border border-slate-300 text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
        }`}
        data-testid={`person-toggle-${person.pubkey.slice(0, 8)}`}
      >
        {selected ? <><Check className="h-4 w-4" /> Following</> : "Follow"}
      </button>
    </div>
  );
}
