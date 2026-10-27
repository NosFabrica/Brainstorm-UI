/**
 * What the Assistants & Duties views share: where the Treasure Map is managed,
 * the duty words, and one person's line (avatar, name, key, handle, website).
 */
import type { ReactNode } from "react";
import { Nip05Handle } from "@/components/Nip05Check";
import { Button } from "@/components/ui/button";
import { PersonAvatar, shortNpub, type Profiles } from "@/components/messages/people";
import { ASSISTANT_TAGS, type AssistantTagKey } from "@/config/assistants";
import type { AssistantActions } from "@/hooks/useAssistantActions";
import type { DutyGroup } from "@/lib/treasureMap";

/** Settings › Treasure Map, where duties are given and taken away. */
export const TREASURE_MAP_PATH = "/settings?tab=treasure-map";

export const DUTY_GROUPS: { key: DutyGroup; label: string }[] = [
  { key: "everything", label: "Everything" },
  { key: "scores", label: "Scores" },
  { key: "lists", label: "Lists" },
  { key: "concepts", label: "Concepts" },
];

/** "No duties", "1 duty", "N duties". */
export function dutyCount(n: number): string {
  return n === 0 ? "No duties" : `${n} ${n === 1 ? "duty" : "duties"}`;
}

/**
 * Why a tag can't be applied: its definition is still being read (""), or
 * wasn't found (a sentence). A tag that's absent here can be applied.
 */
export type TagAvailability = Partial<Record<AssistantTagKey, string>>;

/** One button per Assistant tag, the first the primary. Every one waits while any action publishes. */
export function TagButtons({
  pubkey,
  name,
  actions,
  unavailable,
}: {
  pubkey: string;
  name: string;
  actions: AssistantActions;
  unavailable: TagAvailability;
}) {
  const { busy } = actions;
  return (
    <>
      {ASSISTANT_TAGS.map((tag, i) => (
        <Button
          key={tag.key}
          size="sm"
          variant={i === 0 ? "primary" : "outline"}
          disabled={!!busy || tag.key in unavailable}
          onClick={() => actions.tag(pubkey, name, tag.key)}
          data-testid={`button-tag-${tag.key}`}
        >
          {busy?.kind === "tag" && busy.pubkey === pubkey && busy.key === tag.key ? "Tagging…" : `Tag: ${tag.name}`}
        </Button>
      ))}
    </>
  );
}

/** Why some tag can't be applied, said once — nothing while the definitions are still being read. */
export function UnavailableNote({ unavailable, only }: { unavailable: TagAvailability; only?: AssistantTagKey[] }) {
  const reasons = Object.entries(unavailable)
    .filter(([key, reason]) => reason && (!only || only.includes(key as AssistantTagKey)))
    .map(([, reason]) => reason);
  if (!reasons.length) return null;
  return <p className="text-xs text-amber-700 dark:text-amber-400">{reasons.join(" ")}</p>;
}

/** A duty's key as written on the Map. */
export function DutyKey({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </code>
  );
}

/**
 * A person as these views show them: avatar, name (with `badges` beside it),
 * then their short npub, verified handle and website. The handle only once its
 * domain confirms it (Nip05Handle): an unconfirmed one says nothing true.
 */
export function PersonLine({
  pubkey,
  name,
  profiles,
  badges,
  size = 40,
}: {
  pubkey: string;
  name: string;
  profiles: Profiles;
  badges?: ReactNode;
  size?: number;
}) {
  const profile = profiles.get(pubkey);
  const website = typeof profile?.website === "string" ? profile.website.trim() : "";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <PersonAvatar pubkey={pubkey} profiles={profiles} size={size} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
          {badges}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono">{shortNpub(pubkey)}</span>
          <Nip05Handle
            nip05={profile?.nip05}
            pubkey={pubkey}
            className="inline-flex min-w-0 items-center gap-1"
            iconClassName="h-3 w-3 shrink-0 text-brand-accent"
          />
          {website && <span className="min-w-0 truncate">{website}</span>}
        </div>
      </div>
    </div>
  );
}
