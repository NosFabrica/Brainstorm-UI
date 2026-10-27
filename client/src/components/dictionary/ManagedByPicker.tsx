import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortNpub, type Profiles } from "@/components/messages/people";
import { MapAvatar } from "@/components/treasureMap/parts";
import { ALL, ME, offersAll, type ManagerOption } from "@/lib/managedDictionary";

export const ALL_LABEL = "All of your Assistants";

/** Who a choice is, as the trigger names it. */
export function managerName(choice: string, nameOf: (pubkey: string) => string): string {
  return choice === ME ? "You" : choice === ALL ? ALL_LABEL : nameOf(choice);
}

function detailOf(option: ManagerOption, profiles: Profiles): string {
  if (option.self) return "The copies you signed yourself";
  const profile = profiles.get(option.pubkey);
  const detail = [profile?.website, profile?.nip05].find((v) => typeof v === "string" && v.trim());
  return detail?.trim() || shortNpub(option.pubkey);
}

/**
 * "Managed by" on Settings › Dictionary: whose Dictionary the list shows —
 * the reader's own, one of their Assistants', or all their Assistants'
 * together (lib/managedDictionary). Marks the local Assistant, and the one the
 * Treasure Map gives Concept headers to. A pick closes it.
 */
export function ManagedByPicker({
  options,
  choice,
  settled,
  profiles,
  nameOf,
  onPick,
}: {
  options: ManagerOption[];
  choice: string;
  settled: boolean;
  profiles: Profiles;
  nameOf: (pubkey: string) => string;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (key: string) => {
    onPick(key);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={!settled} data-testid="dictionary-managed-by">
          <span className="font-normal text-slate-500 dark:text-slate-400">Managed by</span>{" "}
          <span className="max-w-[14rem] truncate">{settled ? managerName(choice, nameOf) : "…"}</span>
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1">
        <ul aria-label="Whose Dictionary to show">
          {options.map((option) => (
            <Row
              key={option.key}
              chosen={option.key === choice}
              onClick={() => pick(option.key)}
              avatar={<MapAvatar pubkey={option.pubkey} profiles={profiles} local={option.local} />}
              name={option.self ? "You" : nameOf(option.pubkey)}
              detail={detailOf(option, profiles)}
              chips={
                <>
                  {option.local && (
                    <Chip tone="indigo" size="sm">
                      Local
                    </Chip>
                  )}
                  {option.designated && (
                    <Chip tone="slate" size="sm">
                      Treasure Map
                    </Chip>
                  )}
                </>
              }
            />
          ))}
          {offersAll(options) && (
            <Row
              chosen={choice === ALL}
              onClick={() => pick(ALL)}
              avatar={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Users className="h-4 w-4" aria-hidden />
                </span>
              }
              name={ALL_LABEL}
              detail="Their Dictionaries together, with how many hold each concept"
            />
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  chosen,
  onClick,
  avatar,
  name,
  detail,
  chips,
}: {
  chosen: boolean;
  onClick: () => void;
  avatar: ReactNode;
  name: string;
  detail: string;
  chips?: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={chosen}
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:hover:bg-slate-800"
        data-testid="managed-by-option"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{name}</span>
            {chips}
          </span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{detail}</span>
        </span>
        {chosen && <Check className="h-4 w-4 shrink-0 text-brand-deep" aria-hidden />}
      </button>
    </li>
  );
}
