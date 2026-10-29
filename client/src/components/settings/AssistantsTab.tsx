/**
 * Settings › Assistants & Duties — every profile the reader has tagged with
 * an Assistant tag (config/assistants), the Assistant Brainstorm hosts for
 * them, and what their Treasure Map gives each one to do.
 *
 * Mirrors Tapestry's My Assistants page (/assistants on a Tapestry instance),
 * read from relays rather than a Tapestry server (hooks/useMyAssistants), so
 * the two show the same Assistants and duties. The reader tags a profile from
 * the search card, the not-tagged section or their local row, and changes or
 * disputes a tag from its row (services/assistants: polarity -1, no delete).
 *
 * `?view=duties` opens the Duties view.
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Bot } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { nameOf as profileName } from "@/components/messages/people";
import { AssistantRow } from "@/components/assistants/AssistantRow";
import { AssistantSearch } from "@/components/assistants/AssistantSearch";
import { DutiesView } from "@/components/assistants/DutiesView";
import { MapOnlySection } from "@/components/assistants/MapOnlySection";
import { TREASURE_MAP_PATH, type TagAvailability } from "@/components/assistants/shared";
import { ASSISTANT_TAGS } from "@/config/assistants";
import { useAssistantActions } from "@/hooks/useAssistantActions";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useMyAssistants } from "@/hooks/useMyAssistants";
import { orderRows } from "@/lib/myAssistants";
import { dutiesOf, mapOnlyAssistants } from "@/lib/treasureMap";

type View = "assistants" | "duties";

/** `viewer`: whose Assistants — the signed-in reader on Settings. */
export function AssistantsTab({ viewer }: { viewer: string | null | undefined }) {
  const { rows, settled, definitions, duties, mapStatus } = useMyAssistants(viewer);
  const actions = useAssistantActions(definitions);
  // A tag is offered once its definition is found (Tapestry's rule): until the read settles, quietly not yet.
  const unavailable = useMemo<TagAvailability>(
    () =>
      Object.fromEntries(
        ASSISTANT_TAGS.filter((t) => !definitions[t.key]).map((t) => [
          t.key,
          settled ? `The ${t.name} tag hasn’t been published yet, so it can’t be applied.` : "",
        ]),
      ),
    [definitions, settled],
  );
  const [, navigate] = useLocation();
  const view: View = new URLSearchParams(useSearch()).get("view") === "duties" ? "duties" : "assistants";
  const choose = (next: View) =>
    navigate(next === "duties" ? "/settings?tab=assistants&view=duties" : "/settings?tab=assistants", {
      replace: true,
    });

  const listed = useMemo(() => new Set(rows.map((r) => r.pubkey)), [rows]);
  const tagged = useMemo(() => new Set(rows.filter((r) => r.tags.length).map((r) => r.pubkey)), [rows]);
  const mapOnly = useMemo(() => mapOnlyAssistants(duties, listed), [duties, listed]);
  const people = useMemo(() => [...listed, ...mapOnly.map((m) => m.pubkey)], [listed, mapOnly]);
  const profiles = useLiveProfiles(people);
  const nameOf = useCallback((pubkey: string) => profileName(pubkey, profiles), [profiles]);
  const ordered = useMemo(() => orderRows(rows, nameOf), [rows, nameOf]);
  const onMap = rows.filter((r) => dutiesOf(r.pubkey, duties).count > 0).length;
  const [openKey, setOpenKey] = useState<string | null>(null);

  const [brainstormTag, tapestryTag] = ASSISTANT_TAGS;

  return (
    <>
      <Card className="overflow-hidden" data-testid="card-assistants">
        <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <Bot className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Your Assistants
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Every profile you’ve tagged <strong>{brainstormTag.name}</strong> or <strong>{tapestryTag.name}</strong>.
              Open one to see what it does according to your{" "}
              <Link href={TREASURE_MAP_PATH} className="font-medium text-brand-deep hover:underline">
                Treasure Map
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="border-b border-border px-5 py-3">
          <Tabs value={view} onValueChange={(v) => choose(v as View)}>
            <TabsList aria-label="View">
              <TabsTrigger value="assistants" data-testid="assistants-view-assistants">
                Assistants
              </TabsTrigger>
              <TabsTrigger value="duties" data-testid="assistants-view-duties">
                Duties
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === "duties" ? (
          <DutiesView
            duties={duties}
            mapStatus={mapStatus}
            nameOf={nameOf}
            isTagged={(pubkey) => tagged.has(pubkey)}
            profiles={profiles}
          />
        ) : (
          <div data-testid="view-assistants">
            {viewer && <AssistantSearch viewer={viewer} listed={listed} actions={actions} unavailable={unavailable} />}
            {!rows.length ? (
              <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400" role="status">
                {settled
                  ? "You haven’t tagged any Assistants yet. Search above to find one."
                  : "Loading your Assistants…"}
              </p>
            ) : (
              <>
                <p className="px-5 pt-4 text-xs text-slate-500 dark:text-slate-400">
                  {rows.length} {rows.length === 1 ? "Assistant" : "Assistants"}
                  {mapStatus !== "loading" && ` · ${onMap} on your Treasure Map`}
                </p>
                <ul aria-label="Your Assistants" className="mt-2 border-t border-border">
                  {ordered.map((row) => (
                    <AssistantRow
                      key={row.pubkey}
                      row={row}
                      name={nameOf(row.pubkey)}
                      profiles={profiles}
                      duties={dutiesOf(row.pubkey, duties)}
                      mapStatus={mapStatus}
                      open={openKey === row.pubkey}
                      onToggle={() => setOpenKey(openKey === row.pubkey ? null : row.pubkey)}
                      actions={actions}
                      unavailable={unavailable}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Card>

      {view === "assistants" && (
        <MapOnlySection
          items={mapOnly}
          nameOf={nameOf}
          profiles={profiles}
          actions={actions}
          unavailable={unavailable}
        />
      )}
    </>
  );
}
