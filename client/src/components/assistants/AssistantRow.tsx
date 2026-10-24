import { Link } from "wouter";
import { ChevronDown, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import type { Profiles } from "@/components/messages/people";
import { ASSISTANT_TAGS } from "@/config/assistants";
import type { AssistantActions } from "@/hooks/useAssistantActions";
import type { TreasureMapStatus } from "@/hooks/useMyAssistants";
import type { MyAssistantRow } from "@/lib/myAssistants";
import { profilePath } from "@/lib/shareId";
import type { AssistantDuties } from "@/lib/treasureMap";
import { cn } from "@/lib/utils";
import {
  DUTY_GROUPS,
  DutyKey,
  PersonLine,
  TREASURE_MAP_PATH,
  TagButtons,
  UnavailableNote,
  dutyCount,
  type TagAvailability,
} from "./shared";

/**
 * One of the reader's Assistants: who it is, the tags that make it theirs,
 * and whether their Treasure Map gives it anything to do. Opens to the duties
 * themselves and what the reader can do about the tags. Nothing is said about
 * the Map until it has been read.
 */
export function AssistantRow({
  row,
  name,
  profiles,
  duties,
  mapStatus,
  open,
  onToggle,
  actions,
  unavailable,
}: {
  row: MyAssistantRow;
  name: string;
  profiles: Profiles;
  duties: AssistantDuties;
  mapStatus: TreasureMapStatus;
  open: boolean;
  onToggle: () => void;
  actions: AssistantActions;
  unavailable: TagAvailability;
}) {
  const untagged = !row.tags.length;
  const panelId = `assistant-panel-${row.pubkey}`;
  return (
    <li className="border-b border-border last:border-b-0" data-testid="row-assistant">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-accent/40 dark:hover:bg-slate-900/60"
      >
        <div className="min-w-0 flex-1 space-y-2">
          <PersonLine
            pubkey={row.pubkey}
            name={name}
            profiles={profiles}
            badges={
              row.local && (
                <Chip tone="indigo" size="sm" icon={Home} title="The Assistant Brainstorm hosts for you">
                  Local
                </Chip>
              )
            }
          />
          <div className="flex flex-wrap items-center gap-1.5 pl-[52px]">
            {untagged ? (
              <Chip tone="amber" size="sm" title="You haven’t tagged this Assistant as yours yet">
                Not tagged
              </Chip>
            ) : (
              ASSISTANT_TAGS.filter((t) => row.tags.includes(t.key)).map((t) => (
                <Chip key={t.key} tone="brand" size="sm">
                  {t.name}
                </Chip>
              ))
            )}
            {mapStatus !== "loading" &&
              (duties.count > 0 ? (
                <Chip tone="emerald" size="sm" dot>
                  On Treasure Map
                </Chip>
              ) : (
                <Chip tone="slate" size="sm" dot>
                  Not on Treasure Map
                </Chip>
              ))}
          </div>
        </div>
        <ChevronDown
          className={cn("mt-3 h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 px-5 pb-5 sm:pl-[72px]">
          {row.local && untagged && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This is the Assistant Brainstorm hosts for you, but you haven’t tagged it as yours.
            </p>
          )}
          <DutiesPanel pubkey={row.pubkey} duties={duties} mapStatus={mapStatus} />
          <TagActions row={row} name={name} actions={actions} unavailable={unavailable} />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={TREASURE_MAP_PATH}>Manage on Treasure Map</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={profilePath(row.pubkey)}>View profile</Link>
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * What the reader can do about a row's tags. Untagged (their local
 * Assistant): tag it. One tag: change it to the other. Any tag: say it isn't
 * theirs — a dispute, so never "Remove" (docs/decentralized-tagging).
 */
function TagActions({
  row,
  name,
  actions,
  unavailable,
}: {
  row: MyAssistantRow;
  name: string;
  actions: AssistantActions;
  unavailable: TagAvailability;
}) {
  const { busy } = actions;
  const mine = busy?.pubkey === row.pubkey ? busy : null;
  if (!row.tags.length) {
    return (
      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <TagButtons pubkey={row.pubkey} name={name} actions={actions} unavailable={unavailable} />
        </div>
        <UnavailableNote unavailable={unavailable} />
      </section>
    );
  }
  const [only] = row.tags.length === 1 ? row.tags : [];
  const other = only ? ASSISTANT_TAGS.find((t) => t.key !== only) : undefined;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {only && other && (
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || other.key in unavailable}
            onClick={() => actions.change(row.pubkey, name, only, other.key)}
            data-testid="button-change-tag"
          >
            {mine?.kind === "change" ? "Changing…" : `Change to ${other.name}`}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => actions.disown(row.pubkey, name, row.tags)}
          data-testid="button-not-my-assistant"
        >
          {mine?.kind === "disown" ? "Publishing…" : "Not my Assistant"}
        </Button>
      </div>
      {other && <UnavailableNote unavailable={unavailable} only={[other.key]} />}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        “Not my Assistant” publishes that it isn’t yours. Your earlier tag stays on relays, but stops counting.
      </p>
    </section>
  );
}

function DutiesPanel({
  pubkey,
  duties,
  mapStatus,
}: {
  pubkey: string;
  duties: AssistantDuties;
  mapStatus: TreasureMapStatus;
}) {
  if (mapStatus === "loading") {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Reading your Treasure Map…</p>;
  }
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Duties on your Treasure Map</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">{dutyCount(duties.count)}</span>
      </div>
      {duties.count === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This Assistant isn’t listed on your Treasure Map, so clients won’t ask it for anything. Add it from your
          Treasure Map to give it duties.
        </p>
      ) : (
        DUTY_GROUPS.filter((g) => duties[g.key].length).map((g) => (
          <div key={g.key}>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">{g.label}</p>
            <ul className="mt-1.5 space-y-1.5">
              {duties[g.key].map((duty) => (
                <li
                  key={duty.key}
                  className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                >
                  <span>{duty.title}</span>
                  <DutyKey>{duty.key}</DutyKey>
                  {duty.assistants[0] !== pubkey && (
                    <Chip tone="slate" size="sm">
                      Alternate
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
