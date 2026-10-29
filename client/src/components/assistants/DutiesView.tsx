import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Profiles } from "@/components/messages/people";
import type { TreasureMapStatus } from "@/hooks/useMyAssistants";
import { profilePath } from "@/lib/shareId";
import { assistantRole, dutySentence, type Duty } from "@/lib/treasureMap";
import { cn } from "@/lib/utils";
import { DutyKey, PersonLine, TREASURE_MAP_PATH } from "./shared";

/**
 * Every duty on the reader's Treasure Map, most generic first, each with the
 * Assistant it prefers and its alternates, then the duties their Brainstorm
 * Assistant offers by default that the Map doesn't name: covered by a broader
 * key, or unassigned. Opens to the duty in words and the entries behind it,
 * as written on the Map.
 */
export function DutiesView({
  duties,
  mapStatus,
  nameOf,
  isTagged,
  profiles,
}: {
  duties: Duty[];
  mapStatus: TreasureMapStatus;
  nameOf: (pubkey: string) => string;
  /** Whether the reader holds this Assistant as one of theirs (tagged, not merely hosted). */
  isTagged: (pubkey: string) => boolean;
  profiles: Profiles;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (mapStatus === "loading") {
    return <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">Reading your Treasure Map…</p>;
  }
  const unassigned = duties.filter((d) => !d.assistants.length).length;
  return (
    <div data-testid="view-duties">
      <div className="space-y-2 px-5 py-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Every duty on your Treasure Map, from the most generic (a whole kind of Score or List) to the most granular
          (one exact Score, List or Concept). Within a duty, the first Assistant listed is preferred; the rest are
          alternates. The duties your Brainstorm Assistant offers by default are listed too, unassigned where your Map
          gives them to no one.
        </p>
        {mapStatus === "none" && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You haven’t published a Treasure Map yet, so no Assistant has duties.
          </p>
        )}
        {duties.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="duties-count">
            {duties.length} {duties.length === 1 ? "duty" : "duties"}
            {unassigned > 0 && ` · ${unassigned} unassigned`} · Most generic first
          </p>
        )}
      </div>
      {(mapStatus === "found" || duties.length > 0) &&
        (duties.length ? (
          <ol className="border-t border-border" aria-label="Duties on your Treasure Map">
            {duties.map((duty, i) => (
              <DutyRow
                key={duty.key}
                rank={i + 1}
                duty={duty}
                nameOf={nameOf}
                isTagged={isTagged}
                profiles={profiles}
                open={openKey === duty.key}
                onToggle={() => setOpenKey(openKey === duty.key ? null : duty.key)}
              />
            ))}
          </ol>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate-500 dark:text-slate-400">Your Treasure Map lists no duties yet.</p>
        ))}
    </div>
  );
}

function NotTagged() {
  return (
    <Chip tone="amber" size="sm" title="On your Treasure Map, but not tagged as one of your Assistants">
      Not tagged
    </Chip>
  );
}

function Unassigned() {
  return (
    <Chip tone="amber" size="sm" data-testid="chip-duty-unassigned">
      Unassigned
    </Chip>
  );
}

function DutyRow({
  rank,
  duty,
  nameOf,
  isTagged,
  profiles,
  open,
  onToggle,
}: {
  rank: number;
  duty: Duty;
  nameOf: (pubkey: string) => string;
  isTagged: (pubkey: string) => boolean;
  profiles: Profiles;
  open: boolean;
  onToggle: () => void;
}) {
  const [preferred, ...alternates] = duty.assistants;
  const panelId = `duty-panel-${rank}`;
  return (
    <li className="border-b border-border last:border-b-0" data-testid="row-duty">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-accent/40 dark:hover:bg-slate-900/60"
      >
        <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs text-slate-400">{rank}</span>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 sm:gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{duty.title}</span>
              <Chip tone={duty.level === "Scope" ? "violet" : "sky"} size="sm">
                {duty.level}
              </Chip>
              {duty.offeredBy && (
                <Chip
                  tone="indigo"
                  size="sm"
                  title={`Offered by default by ${nameOf(duty.offeredBy)}`}
                  data-testid="chip-duty-offered"
                >
                  Brainstorm default
                </Chip>
              )}
            </div>
            <DutyKey>{duty.key}</DutyKey>
          </div>
          <div className="min-w-0 space-y-1 text-sm">
            {preferred ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 sm:hidden">Preferred:</span>
                <span className="truncate text-slate-800 dark:text-slate-200">{nameOf(preferred)}</span>
                {!isTagged(preferred) && <NotTagged />}
              </div>
            ) : (
              <Unassigned />
            )}
            {duty.through && (
              <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="duty-through">
                Through <DutyKey>{duty.through}</DutyKey>
              </p>
            )}
            {alternates.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alternates: {alternates.map(nameOf).join(", ")}
              </p>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn("mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && !preferred && (
        <div id={panelId} className="space-y-3 px-5 pb-5 sm:pl-14">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            No entry on your Treasure Map gives this duty to an Assistant, so clients won’t ask anyone for it.
            {duty.offeredBy && ` ${nameOf(duty.offeredBy)} offers it by default.`}
          </p>
          <Link href={TREASURE_MAP_PATH} className="inline-block text-sm font-medium text-brand-deep hover:underline">
            Assign it on Treasure Map →
          </Link>
        </div>
      )}
      {open && preferred && (
        <div id={panelId} className="space-y-4 px-5 pb-5 sm:pl-14">
          <section className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assistants for this duty</h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {alternates.length ? "First listed is preferred" : "Only provider"}
              </span>
            </div>
            <ol className="space-y-2">
              {duty.assistants.map((pubkey, i) => (
                <li key={pubkey} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {assistantRole(i, duty.assistants.length)}
                  </span>
                  <PersonLine
                    pubkey={pubkey}
                    name={nameOf(pubkey)}
                    profiles={profiles}
                    size={32}
                    badges={!isTagged(pubkey) && <NotTagged />}
                  />
                  <Link
                    href={profilePath(pubkey)}
                    className="shrink-0 text-xs font-medium text-brand-deep hover:underline"
                  >
                    View profile
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">On your Treasure Map</h3>
            {duty.through && (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Your Map doesn’t name this duty; its broader <DutyKey>{duty.through}</DutyKey> entry covers it.
              </p>
            )}
            <p className="text-sm text-slate-700 dark:text-slate-300">{dutySentence(duty, nameOf)}</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {duty.entries.map((entry) => JSON.stringify(entry)).join("\n")}
            </pre>
            <Link href={TREASURE_MAP_PATH} className="inline-block text-sm font-medium text-brand-deep hover:underline">
              Manage on Treasure Map →
            </Link>
          </section>
        </div>
      )}
    </li>
  );
}
