import { Link } from "wouter";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Profiles } from "@/components/messages/people";
import type { AssistantActions } from "@/hooks/useAssistantActions";
import { profilePath } from "@/lib/shareId";
import { PersonLine, TagButtons, UnavailableNote, type TagAvailability } from "./shared";

/**
 * The Assistants the reader's Treasure Map gives duties to but who aren't in
 * their list — so the Map and the list can't quietly disagree — each a press
 * away from joining it. Absent when there are none.
 */
export function MapOnlySection({
  items,
  nameOf,
  profiles,
  actions,
  unavailable,
}: {
  items: { pubkey: string; count: number }[];
  nameOf: (pubkey: string) => string;
  profiles: Profiles;
  actions: AssistantActions;
  unavailable: TagAvailability;
}) {
  if (!items.length) return null;
  return (
    <Card className="overflow-hidden" data-testid="card-map-only-assistants">
      <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <MapPin className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
            On your Treasure Map, but not tagged
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            These Assistants have duties on your Treasure Map, but you haven’t tagged them as yours. Tag them to add
            them to your list.
          </p>
          <UnavailableNote unavailable={unavailable} />
        </div>
      </div>
      <ul>
        {items.map(({ pubkey, count }) => (
          <li
            key={pubkey}
            className="space-y-3 border-b border-border px-5 py-4 last:border-b-0"
            data-testid="row-map-only-assistant"
          >
            <div className="flex flex-wrap items-center gap-3">
              <PersonLine pubkey={pubkey} name={nameOf(pubkey)} profiles={profiles} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {count} {count === 1 ? "duty" : "duties"} on your Treasure Map
              </span>
              <Link href={profilePath(pubkey)} className="text-xs font-medium text-brand-deep hover:underline">
                View profile
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 pl-[52px]">
              <TagButtons pubkey={pubkey} name={nameOf(pubkey)} actions={actions} unavailable={unavailable} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
