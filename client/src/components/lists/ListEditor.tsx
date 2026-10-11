/**
 * A list's header, authored or edited (lib/listDraft): the same definition
 * form as "Publish my own version" (DefinitionForm) beside a live preview of
 * an example item drawn by the real renderers (ItemPreview), so a field's
 * type, a display hint or a URL template shows what it does as it's set.
 *
 * Example values belong to a field's name: renaming the field leaves its value
 * behind, while changing its type or how required it is keeps it (text to url
 * turns the value into a link). A list someone else published is shown, not
 * edited: its header is theirs to sign.
 */
import { useEffect, useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import { DefinitionForm } from "@/components/dictionary/DefinitionForm";
import { ItemFieldInputs, type FieldValues } from "@/components/lists/ItemFieldInputs";
import { ItemPreview } from "@/components/lists/ItemPreview";
import { draftProblems, type CopyDraft } from "@/lib/conceptCopy";
import { definitionOf, type HeaderEvent } from "@/lib/conceptResolution";
import {
  exampleItem,
  listDraftOf,
  listHeaderTemplate,
  listProblems,
  newListDraft,
  previewDefinition,
  slugOf,
} from "@/lib/listDraft";
import { publishListEvent } from "@/services/lists";

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
  const [draft, setDraft] = useState<CopyDraft>(() =>
    header ? listDraftOf(definitionOf(header as HeaderEvent)) : newListDraft(),
  );
  const publishedD = header?.tags.find((t) => t[0] === "d")?.[1] ?? null;
  // A new list's d follows its name until it's typed.
  const [typedD, setTypedD] = useState<string | null>(null);
  const d = publishedD ?? typedD ?? slugOf(draft.plural);

  const template = useMemo(
    () => listHeaderTemplate(draft, { d, author, previous: header }),
    [draft, d, author, header],
  );
  const resolved = useMemo(() => previewDefinition(template, author), [template, author]);

  const [values, setValues] = useState<FieldValues>({});
  // A renamed field's example goes with its old name.
  const names = resolved.governing.fields.map((f) => f.name).join("\n");
  useEffect(() => {
    const keep = new Set(names.split("\n"));
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([name]) => keep.has(name))));
  }, [names]);
  const item = useMemo(() => exampleItem(resolved.governing, values, me), [resolved, values, me]);

  const problems = own
    ? [
        ...draftProblems(draft),
        ...listProblems(d),
        ...(!header && takenDs.has(d) ? [`You already have a list at "${d}": give this one another identifier.`] : []),
      ]
    : [];
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const publish = async () => {
    if (publishing || problems.length || !own) return;
    setPublishing(true);
    setError(null);
    try {
      await publishListEvent(template);
      setPublished(true);
      onPublished(`39998:${author}:${d}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  };

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

        {own ? (
          <DefinitionForm draft={draft} setDraft={setDraft} itemsTotal={0} testId="list-editor" idPrefix="list" />
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
            <div
              className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-900"
              data-testid="list-editor-tags"
            >
              {template.tags.map((t, i) => (
                <code
                  key={i}
                  className="min-w-0 break-all rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300"
                >
                  {JSON.stringify(t)}
                </code>
              ))}
            </div>
          </div>
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
              disabled={publishing || problems.length > 0}
              data-testid="list-editor-publish"
            >
              {publishing ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Publishing…
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
        <ItemPreview resolved={resolved} item={item} testId="list-preview" />
      </div>
    </div>
  );
}
