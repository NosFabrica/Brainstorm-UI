/**
 * A NIP-65 relay list (kind 10002) on its page: the relays someone named, each
 * with what they use it for. NIP-65: an `r` with no marker is both; `read`
 * is where they expect mentions, `write` where they publish. The tags stay
 * one click away under "Advanced view", as on a list's page.
 */
import { useMemo, useState } from "react";
import { Braces, List, RadioTower } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { SectionHeader } from "@/components/ui/section-header";
import { StructuralHero } from "@/components/share/StructuralHero";
import { relayHost, relayListSummary } from "@/components/search/relayStatusCards";
import { relayListEntries } from "@/lib/relayList";
import type { MinimalEvent } from "@/lib/noteRefs";

export function RelayListHero({ event }: { event: MinimalEvent }) {
  const [advanced, setAdvanced] = useState(false);
  const entries = useMemo(() => relayListEntries(event), [event]);
  const toggle = (
    <button
      type="button"
      onClick={() => setAdvanced((v) => !v)}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
      data-testid="relay-list-advanced-toggle"
    >
      {advanced ? (
        <>
          <List className="h-3.5 w-3.5" /> List view
        </>
      ) : (
        <>
          <Braces className="h-3.5 w-3.5" /> Advanced view
        </>
      )}
    </button>
  );
  if (advanced)
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{toggle}</div>
        <StructuralHero event={event} />
      </div>
    );
  return (
    <div className="space-y-4" data-testid="relay-list-hero">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <RadioTower className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="min-w-0">
            <h1
              className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Relays
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="relay-list-summary">
              {entries.length ? relayListSummary(entries) : "No relays listed"}
            </p>
          </div>
        </div>
        {toggle}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Where they publish (write) and where they look for posts that mention them (read).
      </p>
      {entries.length > 0 && (
        <section>
          <SectionHeader kicker="Relays" />
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800/60" data-testid="relay-list-relays">
            {entries.map((e) => (
              <li
                key={e.url}
                className="flex min-w-0 items-center justify-between gap-3 py-2"
                data-testid="relay-list-relay"
              >
                <span className="min-w-0 truncate font-mono text-sm text-slate-800 dark:text-slate-100">
                  {relayHost(e.url)}
                </span>
                <span className="flex shrink-0 gap-1">
                  {e.read && (
                    <Chip size="sm" tone="slate" data-testid="relay-read">
                      Read
                    </Chip>
                  )}
                  {e.write && (
                    <Chip size="sm" tone="slate" data-testid="relay-write">
                      Write
                    </Chip>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
