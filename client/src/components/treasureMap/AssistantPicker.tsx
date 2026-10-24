import { useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Profiles } from "@/components/messages/people";
import { ASSISTANTS_PATH, MapAvatar } from "./parts";

/** One of the reader's Assistants, as the picker lists it. */
export interface PickerRow {
  pubkey: string;
  name: string;
  local: boolean;
  /** Its website, else its NIP-05, else its short npub. */
  detail: string;
}

/**
 * The reader's Assistants behind a button (Assistants & Duties' list, in its
 * order: the local one first, then by name), marking the local one, the
 * card's current Assistant and the one chosen. A pick closes it.
 */
export function AssistantPicker({
  label,
  primary = false,
  rows,
  loading,
  current,
  selected,
  onPick,
  profiles,
  disabled,
  testId,
}: {
  label: string;
  primary?: boolean;
  rows: PickerRow[];
  loading: boolean;
  current: string | null;
  selected: string | null | undefined;
  onPick: (pubkey: string) => void;
  profiles: Profiles;
  disabled?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = selected || current;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant={primary ? "primary" : "outline"} disabled={disabled} data-testid={testId}>
          {label}
          <ChevronDown aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-slate-500 dark:text-slate-400" role="status">
            {loading ? (
              "Loading your Assistants…"
            ) : (
              <>
                You have no Assistants yet. Add one on the{" "}
                <Link href={ASSISTANTS_PATH} className="font-medium text-brand-deep hover:underline">
                  Assistants &amp; Duties
                </Link>{" "}
                tab.
              </>
            )}
          </p>
        ) : (
          <ul aria-label="Your Assistants">
            {rows.map((row) => (
              <li key={row.pubkey}>
                <button
                  type="button"
                  aria-pressed={row.pubkey === chosen}
                  onClick={() => {
                    onPick(row.pubkey);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:hover:bg-slate-800"
                  data-testid="picker-row"
                >
                  <MapAvatar pubkey={row.pubkey} profiles={profiles} local={row.local} />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {row.name}
                      </span>
                      {row.local && (
                        <Chip tone="indigo" size="sm">
                          Local
                        </Chip>
                      )}
                      {row.pubkey === current && (
                        <Chip tone="slate" size="sm">
                          Current
                        </Chip>
                      )}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{row.detail}</span>
                  </span>
                  {row.pubkey === chosen && <Check className="h-4 w-4 shrink-0 text-brand-deep" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
