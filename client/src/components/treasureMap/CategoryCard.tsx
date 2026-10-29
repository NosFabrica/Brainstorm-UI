import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Profiles } from "@/components/messages/people";
import { entryRole, type CategoryEntry, type MapCategory } from "@/lib/treasureMapCards";
import { cn } from "@/lib/utils";
import { MapAvatar } from "./parts";

export const CATEGORY_WORDS: Record<MapCategory, { title: string; description: string }> = {
  scores: { title: "Scores", description: "Trust scores for profiles and content, one at a time." },
  lists: { title: "Lists", description: "Curated lists of profiles and content." },
  concepts: { title: "Concepts", description: "Structured datasets your community organizes together." },
};

/**
 * One category of the reader's Treasure Map — Scores, Lists or Concepts —
 * and who it gives that category to: no one ("Needs attention"), one
 * Assistant, or several ("Mixed"). In Edit mode it is drawn from the edited
 * Map, with its picker row as `children`. Its details list every entry
 * behind it, as written, and every Assistant each names.
 */
export function CategoryCard({
  category,
  assistants,
  entries,
  nameOf,
  profiles,
  localPubkey,
  pending = false,
  children,
}: {
  category: MapCategory;
  assistants: string[];
  entries: CategoryEntry[];
  nameOf: (pubkey: string) => string;
  profiles: Profiles;
  localPubkey: string | null;
  pending?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { title, description } = CATEGORY_WORDS[category];
  const isLocal = (pubkey: string) => !!localPubkey && pubkey === localPubkey;
  const detailsId = `treasure-map-details-${category}`;
  return (
    <li
      className={cn(
        "space-y-3 rounded-xl border bg-white p-4 dark:bg-slate-900",
        pending ? "border-brand-accent/50" : "border-border",
      )}
      data-testid={`card-category-${category}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {!assistants.length && <span className="sr-only">Needs attention: </span>}
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
            {!assistants.length && (
              <Chip tone="amber" size="sm" aria-hidden>
                Needs attention
              </Chip>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {assistants.length === 0 ? (
            <span className="text-slate-500 dark:text-slate-400">Not assigned yet</span>
          ) : (
            <>
              <span className="text-xs text-slate-500 dark:text-slate-400">Assigned to</span>
              {assistants.length === 1 ? (
                <span className="flex items-center gap-2">
                  <MapAvatar pubkey={assistants[0]} profiles={profiles} local={isLocal(assistants[0])} />
                  <span className="font-medium text-slate-900 dark:text-slate-100">{nameOf(assistants[0])}</span>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="flex -space-x-2" aria-hidden>
                    {assistants.slice(0, 3).map((pubkey) => (
                      <MapAvatar key={pubkey} pubkey={pubkey} profiles={profiles} local={isLocal(pubkey)} />
                    ))}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">Mixed</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">· {assistants.length} Assistants</span>
                  <ul className="sr-only">
                    {assistants.map((pubkey) => (
                      <li key={pubkey}>{nameOf(pubkey)}</li>
                    ))}
                  </ul>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {children}

      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40"
        >
          {open ? "Hide details" : "Show details"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        {open && (
          <div id={detailsId} role="region" aria-label={`${title} details`} className="mt-3">
            {entries.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No entries yet.</p>
            ) : (
              <ul className="space-y-3">
                {entries.map((entry) => {
                  const label =
                    entry.norm === "*"
                      ? "Everything else"
                      : entryRole(category, [entry.key, entry.tags[0].pubkey]) === "individual"
                        ? "Individually assigned"
                        : null;
                  return (
                    <li key={entry.norm} className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {entry.key}
                        </code>
                        {label && (
                          <Chip tone="slate" size="sm">
                            {label}
                          </Chip>
                        )}
                      </div>
                      <ul className="space-y-1.5 pl-2">
                        {entry.tags.map((tag, i) => (
                          // One key may name an Assistant twice, so a row's place is its identity.
                          <li key={i} className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                            <MapAvatar pubkey={tag.pubkey} profiles={profiles} local={isLocal(tag.pubkey)} size={22} />
                            <span className="font-medium text-slate-800 dark:text-slate-200">{nameOf(tag.pubkey)}</span>
                            <span className="min-w-0 truncate font-mono text-slate-500 dark:text-slate-400">
                              {tag.relay || "No relay"}
                            </span>
                            {i > 0 && (
                              <Chip tone="slate" size="sm">
                                Backup
                              </Chip>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
