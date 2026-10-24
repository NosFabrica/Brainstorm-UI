/**
 * Settings › Treasure Map — the reader's kind 10040, by category: who it asks
 * for Scores, Lists and Concepts, and the entries behind each; and Edit mode,
 * to give a category, or all of them, to one of their Assistants and save.
 *
 * Mirrors Tapestry's Manage your Treasure Map page (/treasure-map on a
 * Tapestry instance), words and rules: lib/treasureMapCards reads the Map,
 * lib/treasureMapEdit edits it, services/treasureMap saves it. The Map comes
 * from the store (useTrustProviderList); the Assistants offered are the ones
 * Assistants & Duties lists (useMyAssistants), the local one Brainstorm's
 * (`ta_pubkey`). Tapestry's Advanced page — every entry, and who provides it
 * — is Assistants & Duties' Duties view here.
 */
import { useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ArrowRight, Map as MapIcon, Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { nameOf as profileName, shortNpub } from "@/components/messages/people";
import { AssistantPicker, type PickerRow } from "@/components/treasureMap/AssistantPicker";
import { CategoryCard } from "@/components/treasureMap/CategoryCard";
import { ADVANCED_PATH, KindChip, RawMapViewer, SwitchRow, TreasureMapFaq } from "@/components/treasureMap/parts";
import { tagRelays } from "@/config/tagging";
import { useHasMywot } from "@/hooks/useHasMywot";
import { useLiveProfiles } from "@/hooks/useLiveProfile";
import { useMyAssistants } from "@/hooks/useMyAssistants";
import { useTreasureMapEdit, type TreasureMapEdit } from "@/hooks/useTreasureMapEdit";
import { useTrustProviderList } from "@/hooks/useTrustProviderStatus";
import { orderRows } from "@/lib/myAssistants";
import { CATEGORIES, categoryAssistants, categoryEntries } from "@/lib/treasureMapCards";
import {
  currentAll,
  currentOf,
  makeRelayFor,
  overrideAllState,
  planEdit,
  saveNote,
  type EditPlan,
} from "@/lib/treasureMapEdit";
import { getNip85RelayUrl } from "@/services/nostr";

const INTRO =
  "Your Treasure Map tells other apps where to find the insights your Assistant gathers from your trusted community — who to trust, what’s worth your attention, and how your community organizes ideas. Brainstorm keeps it up to date for you.";
const OVERRIDE_OFF = "Kept as they are; they take priority over this assignment.";
const OVERRIDE_ON = "These will be removed from your Treasure Map.";
const duties = (n: number) => `${n} individually assigned ${n === 1 ? "duty" : "duties"}`;

/** Unconfigured is "no relay to name", not a crash in render. */
function nip85Relay(): string {
  try {
    return getNip85RelayUrl();
  } catch {
    return "";
  }
}

/** `viewer`: whose Map — the signed-in reader on Settings. */
export function TreasureMapTab({ viewer }: { viewer: string | null | undefined }) {
  const map = useTrustProviderList(viewer);
  const status = map.event ? "found" : map.settled ? "none" : "loading";
  const event = map.event ?? null;
  const { taPubkey } = useHasMywot();
  const mine = useMyAssistants(viewer);
  const edit = useTreasureMapEdit(viewer);

  // The relay an entry names for Brainstorm's own Assistant: where this deployment publishes that category.
  const relayFor = useMemo(
    () =>
      makeRelayFor({
        localPubkey: taPubkey,
        relays: { scores: nip85Relay(), lists: nip85Relay(), concepts: tagRelays()[0] ?? "" },
      }),
    [taPubkey],
  );
  const plan = useMemo(
    () =>
      edit.editing && viewer && status !== "loading"
        ? planEdit({ event, viewer, pending: edit.pending, relayFor })
        : null,
    [edit.editing, viewer, status, event, edit.pending, relayFor],
  );

  const published = useMemo(
    () => ({ assistants: categoryAssistants(event), entries: categoryEntries(event) }),
    [event],
  );
  const shown = useMemo(
    () => (plan ? { assistants: categoryAssistants(plan.draft), entries: categoryEntries(plan.draft) } : published),
    [plan, published],
  );
  const people = useMemo(
    () => [
      ...new Set([
        ...[published, shown].flatMap((m) =>
          CATEGORIES.flatMap((c) => m.entries[c].flatMap((e) => e.tags.map((t) => t.pubkey))),
        ),
        ...mine.rows.map((r) => r.pubkey),
      ]),
    ],
    [published, shown, mine.rows],
  );
  const profiles = useLiveProfiles(people);
  const nameOf = useCallback((pubkey: string) => profileName(pubkey, profiles), [profiles]);
  const pickerRows = useMemo<PickerRow[]>(
    () =>
      orderRows(mine.rows, nameOf).map((row) => {
        const profile = profiles.get(row.pubkey);
        const detail = [profile?.website, profile?.nip05].find((v) => typeof v === "string" && v.trim());
        return {
          pubkey: row.pubkey,
          name: nameOf(row.pubkey),
          local: row.local,
          detail: detail?.trim() || shortNpub(row.pubkey),
        };
      }),
    [mine.rows, nameOf, profiles],
  );
  const localPubkey = taPubkey ?? null;
  const picking = { rows: pickerRows, loading: !mine.settled, profiles, disabled: edit.busy };

  return (
    <>
      <Card className="overflow-hidden" data-testid="card-treasure-map">
        <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <MapIcon className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Manage your Treasure Map
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{INTRO}</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <TreasureMapFaq />
        </div>
      </Card>

      {!viewer ? (
        <Card>
          <p className="p-5 text-sm text-slate-500 dark:text-slate-400">Sign in to see your Treasure Map.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden" data-testid="card-treasure-map-categories">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-slate-50 px-5 py-3 dark:bg-slate-900">
            <h2 className="font-display text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Assistants by category
            </h2>
            {status !== "loading" && (
              <Button
                size="sm"
                variant={edit.editing ? "primary" : "outline"}
                aria-pressed={edit.editing}
                disabled={edit.busy}
                onClick={edit.toggle}
                data-testid="button-treasure-map-edit"
              >
                <Pencil aria-hidden />
                {edit.editing ? "Editing" : "Edit"}
              </Button>
            )}
          </div>

          <div className="space-y-4 p-5">
            {!edit.editing && edit.outcome?.outcome === "partial" && (
              <Alert variant="info">
                <AlertDescription>
                  Your Treasure Map was accepted by {edit.outcome.accepted} of {edit.outcome.total} relays.{" "}
                  {edit.outcome.total - edit.outcome.accepted} did not accept it.
                </AlertDescription>
              </Alert>
            )}

            {status === "loading" ? (
              <p className="text-sm text-slate-500 dark:text-slate-400" role="status">
                Loading your Treasure Map…
              </p>
            ) : (
              <>
                {plan && status === "none" && (
                  <Alert variant="warning">
                    <AlertDescription>
                      We didn’t find a Treasure Map on your relays, so saving will publish a new one. If you already
                      have one on a relay we couldn’t check, the new one will replace it.
                    </AlertDescription>
                  </Alert>
                )}
                {plan && (
                  <AllDuties
                    edit={edit}
                    plan={plan}
                    current={currentAll(published.assistants)}
                    nameOf={nameOf}
                    picking={picking}
                  />
                )}

                <ul className="space-y-3">
                  {CATEGORIES.map((category) => {
                    const current = currentOf(published.assistants[category]);
                    const chosen = edit.pending[category];
                    return (
                      <CategoryCard
                        key={category}
                        category={category}
                        assistants={shown.assistants[category]}
                        entries={shown.entries[category]}
                        nameOf={nameOf}
                        profiles={profiles}
                        localPubkey={localPubkey}
                        pending={!!plan && !!chosen}
                      >
                        {plan && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <AssistantPicker
                                label={chosen ? "Change" : "Choose an Assistant"}
                                current={current}
                                selected={chosen}
                                onPick={(pubkey) => edit.pick(category, pubkey, current)}
                                testId={`picker-${category}`}
                                {...picking}
                              />
                              {chosen && (
                                <>
                                  <Chip tone="brand" size="sm">
                                    Unsaved
                                  </Chip>
                                  <span className="text-xs text-slate-600 dark:text-slate-300">
                                    Will be assigned to {nameOf(chosen)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    disabled={edit.busy}
                                    onClick={() => edit.undo(category)}
                                  >
                                    Undo
                                  </Button>
                                </>
                              )}
                            </div>
                            {chosen && plan.duties[category].length > 0 && (
                              <SwitchRow
                                id={`treasure-map-override-${category}`}
                                label={`Override ${duties(plan.duties[category].length)}`}
                                note={edit.pending.override?.[category] ? OVERRIDE_ON : OVERRIDE_OFF}
                                on={!!edit.pending.override?.[category]}
                                onChange={(on) => edit.setOverride(category, on)}
                                disabled={edit.busy}
                              />
                            )}
                          </div>
                        )}
                      </CategoryCard>
                    );
                  })}
                </ul>

                {plan && plan.backups > 0 && (
                  <SwitchRow
                    id="treasure-map-backups"
                    label={`Remove ${plan.backups} backup ${plan.backups === 1 ? "Assistant" : "Assistants"}`}
                    note={
                      edit.pending.backups
                        ? "Every entry keeps only its first Assistant, including entries not shown on this page."
                        : "Kept as they are. Apps use a backup when an entry’s first Assistant can’t be reached."
                    }
                    on={!!edit.pending.backups}
                    onChange={edit.setBackups}
                    disabled={edit.busy}
                  />
                )}

                {plan && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
                      {saveNote(plan.changed ? plan.pending : {}, nameOf)}
                    </p>
                    <Button
                      disabled={!plan.changed || edit.busy}
                      onClick={() => void edit.save(event, plan)}
                      data-testid="button-treasure-map-save"
                    >
                      {edit.busy ? "Saving…" : "Save changes"}
                    </Button>
                  </div>
                )}
                {plan && <SaveProblem edit={edit} />}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mixed assignments can be reviewed on the{" "}
                  <Link href={ADVANCED_PATH} className="font-medium text-brand-deep hover:underline">
                    Advanced page
                  </Link>
                  .
                </p>
              </>
            )}
          </div>

          <div className="border-t border-border">
            <RawMapViewer
              show="View the raw Treasure Map"
              hide="Hide the raw Treasure Map"
              chip={<KindChip>kind 10040</KindChip>}
              label="Raw Treasure Map"
            >
              {status === "found" ? (
                <pre>{JSON.stringify(event, null, 2)}</pre>
              ) : status === "none" ? (
                <div className="font-sans text-sm">
                  <p className="font-semibold">No Treasure Map found</p>
                  <p>We couldn’t locate a kind 10040 event for your profile on your relays.</p>
                </div>
              ) : (
                <p className="font-sans text-sm">Loading your Treasure Map…</p>
              )}
            </RawMapViewer>
            {plan && (
              <div className="border-t border-border">
                <RawMapViewer
                  show="View the raw Treasure Map — edited"
                  hide="Hide the raw Treasure Map — edited"
                  chip={
                    <Chip tone="amber" size="sm">
                      Unsaved draft
                    </Chip>
                  }
                  label="Raw Treasure Map — edited"
                >
                  <pre>{JSON.stringify(plan.draft, null, 2)}</pre>
                </RawMapViewer>
              </div>
            )}
          </div>
        </Card>
      )}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-slate-500 dark:text-slate-400">
        Need fine-grained control over every entry?
        <Link
          href={ADVANCED_PATH}
          className="inline-flex items-center gap-1 font-medium text-brand-deep hover:underline"
        >
          Advanced management
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </p>
    </>
  );
}

/** Edit mode's first row: one Assistant for Scores, Lists, Concepts and everything else, with its override switch. */
function AllDuties({
  edit,
  plan,
  current,
  nameOf,
  picking,
}: {
  edit: TreasureMapEdit;
  plan: EditPlan;
  current: string | null;
  nameOf: (pubkey: string) => string;
  picking: Pick<Parameters<typeof AssistantPicker>[0], "rows" | "loading" | "profiles" | "disabled">;
}) {
  const everyone = edit.pending.everything;
  const all = overrideAllState(plan.duties, edit.pending);
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-brand-accent/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">All duties</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Assign one Assistant to Scores, Lists, Concepts, and everything else.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {everyone && (
            <>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{nameOf(everyone)}</span>
              <Button size="sm" variant="ghost" disabled={edit.busy} onClick={edit.undoEveryone}>
                Undo
              </Button>
            </>
          )}
          <AssistantPicker
            label="Assign to all"
            primary
            current={current}
            selected={everyone}
            onPick={(pubkey) => edit.pickEveryone(pubkey, current)}
            testId="picker-all"
            {...picking}
          />
        </div>
      </div>
      {everyone && all.count > 0 && (
        <SwitchRow
          id="treasure-map-override-all"
          label={`Override ${duties(all.count)} across all categories`}
          note={all.on ? OVERRIDE_ON : OVERRIDE_OFF}
          on={all.on}
          onChange={(on) => edit.setOverrideAll(on, plan.duties)}
          disabled={edit.busy}
        />
      )}
    </div>
  );
}

/** What stopped a save, while Edit mode and the changes stay. */
function SaveProblem({ edit }: { edit: TreasureMapEdit }) {
  const answer = edit.outcome;
  if (!answer) return null;
  if (answer.outcome === "changed") {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Your Treasure Map changed since this page read it. The page now shows the new one, with your changes on top;
          check them and save again.
        </AlertDescription>
      </Alert>
    );
  }
  if (answer.outcome === "failed") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Your Treasure Map wasn’t accepted by any relay{answer.total ? ` (0 of ${answer.total})` : ""}: {answer.error}
        </AlertDescription>
      </Alert>
    );
  }
  if (answer.outcome === "not-sent" && answer.message) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{answer.message}</AlertDescription>
      </Alert>
    );
  }
  return null;
}
