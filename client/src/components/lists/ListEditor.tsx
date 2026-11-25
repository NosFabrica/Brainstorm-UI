/**
 * A list's header, authored or edited (lib/listDraft): the same definition
 * form as a Dictionary entry's "Edit" (DefinitionForm) beside a live preview of
 * an example item drawn by the real renderers (ItemPreview), so a field's
 * type, a display hint or a URL template shows what it does as it's set.
 *
 * Example values belong to a field's name: renaming the field leaves its value
 * behind, while changing its type or how required it is keeps it (text to url
 * turns the value into a link). A list someone else published is shown, not
 * edited: its header is theirs to sign.
 *
 * URL templates drafted in the form are previewed as if published
 * (hooks/draftTemplates) and published just before the header that pins them
 * (lib/listPublish). A failed attempt keeps what it signed, so trying again
 * resends rather than asks the signer again.
 *
 * One's own list is edited as a draft on its newest version
 * (hooks/useReplaceableListDraft): the header streams in, so a newer version
 * can arrive while the form is open. Untouched, the form moves onto it;
 * touched, publishing is refused until the newer version is loaded, rather
 * than reverting it. A new list publishes only once its identifier is known
 * to be free: read at that `d`, not guessed from the lists loaded so far.
 */
import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { NostrEvent } from "nostr-tools";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import { DefinitionForm } from "@/components/dictionary/DefinitionForm";
import { TagsReadout } from "@/components/dictionary/TagsReadout";
import { AddressRef } from "@/components/dictionary/AddressRef";
import { ItemFieldInputs, type FieldValues } from "@/components/lists/ItemFieldInputs";
import { ItemPreview } from "@/components/lists/ItemPreview";
import { ImportListDialog } from "@/components/lists/ImportListDialog";
import { withImported, type ImportResult } from "@/lib/listImport";
import { draftProblems, type CopyDraft } from "@/lib/conceptCopy";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";
import {
  exampleItem,
  listCoordinate,
  pointsAtItself,
  listDraftOf,
  listHeaderTemplate,
  listProblems,
  newListDraft,
  previewDefinition,
  slugOf,
} from "@/lib/listDraft";
import { newPublishSession, progressLabel, publishDefinition, type PublishProgress } from "@/lib/listPublish";
import { asTemplate, resolveDraftTemplates } from "@/lib/templateDrafts";
import { DraftTemplatesContext } from "@/hooks/draftTemplates";
import { useDraftTemplateProblems } from "@/hooks/useLinkTemplates";
import { listPublishSteps } from "@/services/lists";
import { useReplaceableListDraft } from "@/hooks/useReplaceableListDraft";
import { NEWER_VERSION_ARRIVED } from "@/lib/replaceableDraft";
import { ListDraftNotice } from "@/components/settings/ListDraftNotice";
import { tagRelays } from "@/config/tagging";
import { dictionaryRelays } from "@/config/dictionary";

/** What the form edits: the definition, and whether the list points at itself. */
interface ListForm {
  draft: CopyDraft;
  selfPointer: boolean;
}

// Put forward as a community concept: a new list is (the team, 2026-10-11); a published one as it was.
const formOf = (header: NostrEvent | null): ListForm =>
  header
    ? { draft: listDraftOf(definitionOf(header as HeaderEvent)), selfPointer: pointsAtItself(header) }
    : { draft: newListDraft(), selfPointer: true };

export function ListEditor({
  header,
  me,
  takenDs,
  onPublished,
}: {
  /** The list as published; null for a new one. */
  header: NostrEvent | null;
  /** The signed-in author. */
  me: string;
  /** The `d`s of lists `me` already has: a new one can't take one. */
  takenDs: ReadonlySet<string>;
  onPublished: (coordinate: string) => void;
}) {
  const own = !header || header.pubkey === me;
  const author = header?.pubkey ?? me;
  const publishedD = header?.tags.find((t) => t[0] === "d")?.[1] ?? null;
  // One's own list at its address is edited in place, on its newest version; a new
  // list (or one with no d to keep) is a form of its own until it's published.
  const inPlace = own && !!header && publishedD !== null;
  const [fresh, setFresh] = useState<ListForm>(() => formOf(header));
  // A new list's d follows its name until it's typed.
  const [typedD, setTypedD] = useState<string | null>(null);
  const freshD = typedD ?? slugOf(fresh.draft.plural);
  const listRelays = useMemo(() => [...new Set([...tagRelays(), ...dictionaryRelays()])], []);
  const list = useReplaceableListDraft(39998, own ? author : null, inPlace ? publishedD! : freshD, {
    // A 9998 opened to edit has no 39998 version yet: the form starts from it.
    read: (ev) => formOf(ev ?? header),
    held: inPlace ? header : null,
    also: listRelays,
    // A new list's d is typed: read it once the typing stops.
    probeDelayMs: inPlace ? 0 : 500,
  });
  const form = inPlace ? list.value : fresh;
  const setForm = (next: SetStateAction<ListForm>) => (inPlace ? list.edit(next) : setFresh(next));
  const { draft, selfPointer } = form;
  const setDraft = (next: SetStateAction<CopyDraft>) =>
    setForm((f) => ({ ...f, draft: typeof next === "function" ? next(f.draft) : next }));
  const setSelfPointer = (on: boolean) => setForm((f) => ({ ...f, selfPointer: on }));
  const d = publishedD ?? freshD;
  // The version the form was made from: what its untouched tags carry over.
  const base = inPlace ? list.base : header;

  // An import's tags the form can't set ride along, as an edited list's own do: in place of those of the same name.
  const [imported, setImported] = useState<ImportResult | null>(null);
  const previous = useMemo(
    () => (base || imported ? { tags: withImported(base?.tags ?? [], imported?.kept ?? []) } : null),
    [base, imported],
  );
  const template = useMemo(
    () => listHeaderTemplate(draft, { d, author, previous, selfPointer }),
    [draft, d, author, previous, selfPointer],
  );
  // A b pointing at another list: this one is someone's version of it.
  const versionOf = (base?.tags ?? [])
    .filter((t) => t[0] === "b" && t[1] && t[1] !== listCoordinate(author, d))
    .map((t) => t[1]);
  const resolved = useMemo(() => previewDefinition(template, author), [template, author]);

  const [values, setValues] = useState<FieldValues>({});
  const [importing, setImporting] = useState(false);
  const applyImport = (result: ImportResult) => {
    setForm((f) => ({ draft: result.draft, selfPointer: result.selfPointer ? true : f.selfPointer }));
    if (publishedD === null && result.d) setTypedD(result.d);
    setValues(result.example);
    setImported(result);
  };
  // A renamed field's example goes with its old name.
  const names = resolved.governing.fields.map((f) => f.name).join("\n");
  useEffect(() => {
    const keep = new Set(names.split("\n"));
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([name]) => keep.has(name))));
  }, [names]);
  const item = useMemo(() => exampleItem(resolved.governing, values, me), [resolved, values, me]);

  const templateProblems = useDraftTemplateProblems(draft, own);
  // Whether a new list's d is free is read at that d, not guessed from the lists loaded so far.
  const taken = !inPlace && d.trim() !== "" && (takenDs.has(d) || (list.status === "ready" && !!list.latest));
  const checking = !inPlace && d.trim() !== "" && !taken && list.status === "loading";
  const problems = own
    ? [
        ...draftProblems(draft),
        ...templateProblems,
        ...listProblems(d),
        ...(taken ? [`You already have a list at "${d}": give this one another identifier.`] : []),
        ...(!inPlace && !taken && list.status === "unreadable"
          ? [`Couldn't check whether you already have a list at "${d}": your relays didn't answer.`]
          : []),
      ]
    : [];
  // Nothing to publish onto until the list's newest version is read, or while a newer one waits.
  const blocked = checking || (inPlace && (list.status !== "ready" || list.stale));
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const session = useRef(newPublishSession());
  const publish = async () => {
    if (publishing || problems.length || blocked || !own) return;
    setPublishing(true);
    setError(null);
    setProgress(null);
    try {
      // On top of the newest version: read once more, refused if one arrived; a new list, if its d was taken.
      const res = await list.publish(async (_value, { createdAt }) => {
        try {
          const done = await publishDefinition({
            draft,
            headerOf: (resolved) =>
              Object.assign(listHeaderTemplate(resolved, { d, author, previous, selfPointer }), {
                created_at: createdAt,
              }),
            steps: listPublishSteps,
            session: session.current,
            onProgress: setProgress,
            // Published, a template is an existing one: the form links it by its real id from now on.
            onTemplatePublished: (t, ev) => setDraft((cur) => resolveDraftTemplates(cur, new Map([[t.id, ev.id]]))),
          });
          session.current = newPublishSession();
          if (!inPlace) setFresh((f) => ({ ...f, draft: done.draft }));
          return { success: true, event: done.header };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
      });
      if (!res.success) {
        setError(
          !inPlace && res.error === NEWER_VERSION_ARRIVED
            ? `You already have a list at "${d}": give this one another identifier.`
            : (res.error ?? "Couldn't publish the list."),
        );
        return;
      }
      setPublished(true);
      onPublished(`39998:${author}:${d}`);
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  };
  const drafted = useMemo(() => new Map(draft.templates.map((t) => [t.id, asTemplate(t)])), [draft.templates]);

  return (
    <div className="grid gap-6 lg:grid-cols-2" data-testid="list-editor">
      <div className="min-w-0 space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="list-d">Identifier (its d tag)</Label>
          {publishedD !== null ? (
            <p className="font-mono text-sm text-slate-700 dark:text-slate-300" data-testid="list-editor-d">
              {publishedD}
            </p>
          ) : (
            <>
              <Input
                id="list-d"
                value={d}
                onChange={(e) => setTypedD(e.target.value)}
                placeholder="taken from the list's name"
                className="h-8 font-mono text-sm"
                data-testid="list-editor-d"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fixed once published: a new identifier is a new list.
              </p>
            </>
          )}
        </div>

        {own && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="list-self-pointer"
              checked={selfPointer}
              onCheckedChange={(v) => setSelfPointer(v === true)}
              data-testid="list-editor-self-pointer"
            />
            <div className="space-y-0.5">
              <Label htmlFor="list-self-pointer">Propose as a community concept</Label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The list points at itself (<code className="font-mono">b</code>): a public signal that you think
                it&rsquo;s a good candidate for a concept others share.
              </p>
            </div>
          </div>
        )}
        {versionOf.length > 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="list-editor-version-of">
            A version of{" "}
            {versionOf.map((c, i) => (
              <span key={c}>
                {i > 0 && ", "}
                <AddressRef address={c} />
              </span>
            ))}
            . That pointer stays as it is.
          </p>
        )}

        {own && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImporting(true)} data-testid="list-editor-import">
              Import from JSON…
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Have an AI draft the list, then tinker here.
            </span>
            <ImportListDialog open={importing} onOpenChange={setImporting} author={author} onImport={applyImport} />
          </div>
        )}
        {imported &&
          (imported.selfPointer ||
            imported.templates.length > 0 ||
            imported.ignored.length > 0 ||
            imported.notes.length > 0 ||
            (publishedD !== null && imported.d && imported.d !== publishedD)) && (
            <ImportReport
              result={imported}
              publishedD={publishedD}
              onDismiss={() =>
                setImported({ ...imported, ignored: [], notes: [], d: null, selfPointer: null, templates: [] })
              }
            />
          )}

        {own ? (
          // Nothing changes under a publish in flight: what was signed is what goes out.
          <fieldset disabled={publishing || (inPlace && !list.canEdit)} className="min-w-0 space-y-5">
            <DefinitionForm draft={draft} setDraft={setDraft} itemsTotal={0} testId="list-editor" idPrefix="list" />
          </fieldset>
        ) : (
          <Alert data-testid="list-editor-theirs">
            <AlertDescription>
              This list was published by someone else, so its definition is theirs to change. The preview shows how its
              items read.
            </AlertDescription>
          </Alert>
        )}

        {own && (
          <div className="space-y-1.5">
            <Label>What it publishes</Label>
            <TagsReadout draft={draft} tags={template.tags} testId="list-editor-tags" />
          </div>
        )}

        {inPlace && <ListDraftNotice draft={list} testId="list-editor-version" />}
        {checking && (
          <p className="flex items-center gap-2 text-xs text-slate-500" data-testid="list-editor-checking-d">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking whether you already have a list at &ldquo;{d}
            &rdquo;…
          </p>
        )}
        {problems.length > 0 && (
          <Alert data-testid="list-editor-problems">
            <AlertDescription>
              <ul className="list-disc space-y-0.5 pl-4 text-sm">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" data-testid="list-editor-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {own && (
          <div className="flex items-center gap-3">
            <Button
              onClick={() => void publish()}
              disabled={publishing || problems.length > 0 || blocked}
              data-testid="list-editor-publish"
            >
              {publishing ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> {progressLabel(progress)}
                </>
              ) : header ? (
                "Publish changes"
              ) : (
                "Publish list"
              )}
            </Button>
            {published && !publishing && (
              <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="list-editor-published">
                Published.
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start" data-testid="list-editor-preview">
        <SectionHeader kicker="Preview" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          An example {resolved.governing.singular.toLowerCase() || "item"}, as it would read. Nothing here is published.
        </p>
        <ItemFieldInputs
          fields={resolved.governing.fields}
          values={values}
          onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
          testId="list-example"
        />
        <DraftTemplatesContext.Provider value={drafted}>
          <ItemPreview resolved={resolved} item={item} testId="list-preview" />
        </DraftTemplatesContext.Provider>
      </div>
    </div>
  );
}

/** What an import couldn't use, and what the AI said about it. */
function ImportReport({
  result,
  publishedD,
  onDismiss,
}: {
  result: ImportResult;
  publishedD: string | null;
  onDismiss: () => void;
}) {
  return (
    <Alert data-testid="list-editor-import-report">
      <AlertDescription className="space-y-2 text-sm">
        {publishedD !== null && result.d && result.d !== publishedD && (
          <p>
            This list keeps its identifier, {publishedD}; the import's {result.d} wasn't used.
          </p>
        )}
        {result.selfPointer && (
          <p data-testid="list-editor-import-self">
            It was proposed as a community concept: it still is, pointing at itself under your key.
          </p>
        )}
        {result.templates.length > 0 && (
          <div>
            <p>URL templates it proposed:</p>
            <ul className="mt-1 space-y-0.5" data-testid="list-editor-import-templates">
              {result.templates.map((o, i) => (
                <li key={i}>
                  <strong>{o.proposed.name || o.proposed.ref || "Unnamed"}</strong>{" "}
                  <code className="break-all font-mono text-xs">{o.proposed.template}</code> —{" "}
                  {o.outcome === "new"
                    ? "new: check it, then it's published with the list"
                    : o.outcome === "existing"
                      ? `already exists as "${o.existing.name}", so the link uses that`
                      : `not used: ${o.why}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.ignored.length > 0 && (
          <div>
            <p>Imported, but these tags weren't used:</p>
            <ul className="mt-1 space-y-0.5" data-testid="list-editor-import-ignored">
              {result.ignored.map(({ tag, why }, i) => (
                <li key={i}>
                  <code className="break-all font-mono text-xs">{JSON.stringify(tag)}</code> — {why}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.notes.length > 0 && (
          <div>
            <p>Notes from the import:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4" data-testid="list-editor-import-notes">
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  );
}
