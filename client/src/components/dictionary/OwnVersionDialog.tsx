/**
 * "Publish my own version" — a form for the reader's own copy of a community
 * concept (lib/conceptCopy), after dlist-ui's create-list: names,
 * description, and the fields its items carry, each required, recommended or
 * optional. The form itself is DefinitionForm, shared with List Management.
 *
 * Rows start from the reader's current version, else the community's: the
 * community's fields (on), then fields the items carry that the definition
 * doesn't (off — "on 2 of 7 items"), then any the reader added. "+ Add a
 * field" makes another. The preview is the tags as they'll be published,
 * so a demo can show exactly what changed.
 *
 * Offered on every Dictionary entry; it began as a demo and is likely the seed
 * of a general list header/item editor. It publishes with the reader's
 * own key, which outranks their Assistant's copy and the community's.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DefinitionForm } from "@/components/dictionary/DefinitionForm";
import { TagsReadout } from "@/components/dictionary/TagsReadout";
import { copyTemplate, draftProblems, initialDraft, type CopyDraft } from "@/lib/conceptCopy";
import type { ConceptDefinition } from "@/lib/conceptResolution";
import { newPublishSession, progressLabel, type PublishProgress } from "@/lib/listPublish";
import { resolveDraftTemplates } from "@/lib/templateDrafts";
import { useDraftTemplateProblems } from "@/hooks/useLinkTemplates";
import { publishOwnCopy } from "@/services/conceptCopy";

export function OwnVersionDialog({
  open,
  onOpenChange,
  community,
  current,
  items,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  community: ConceptDefinition;
  /** The reader's version as it stands, when they have one. */
  current: ConceptDefinition | null;
  /** The list's items — where "fields items carry" comes from. */
  items: { tags: string[][] }[];
  onPublished: () => void;
}) {
  const [draft, setDraft] = useState<CopyDraft>(() => initialDraft(community, current, items));
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What a failed attempt signed, resent by the next (lib/listPublish).
  const session = useRef(newPublishSession());

  // Each opening starts from what's published now, not from an abandoned edit.
  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(community, current, items));
    setError(null);
    session.current = newPublishSession();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const templateProblems = useDraftTemplateProblems(draft, open);
  const problems = [...draftProblems(draft), ...templateProblems];
  const preview = copyTemplate(community, draft).tags;

  const publish = async () => {
    if (publishing || problems.length) return;
    setPublishing(true);
    setError(null);
    try {
      await publishOwnCopy(community, draft, {
        session: session.current,
        onProgress: setProgress,
        // Published, a template is an existing one: linked by its real id from now on.
        onTemplatePublished: (t, ev) => setDraft((cur) => resolveDraftTemplates(cur, new Map([[t.id, ev.id]]))),
      });
      session.current = newPublishSession();
      onPublished();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !publishing && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="own-version-dialog">
        <DialogHeader>
          <DialogTitle>{current ? "Edit your version" : "Publish your own version"}</DialogTitle>
          <DialogDescription>
            Your own {community.plural}, signed with your key and pointing at the community&rsquo;s. Wherever
            you&rsquo;re signed in, items are shown by your version&rsquo;s fields.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: DialogContent is a grid, and a grid child won't shrink below its
            widest word — the preview's 64-hex coordinate would push the modal sideways. */}
        <div className="min-w-0 space-y-4">
          <fieldset disabled={publishing} className="min-w-0 space-y-4">
            <DefinitionForm draft={draft} setDraft={setDraft} itemsTotal={items.length} templatesEnabled={open} />
          </fieldset>

          <div className="space-y-1.5">
            <Label>Preview</Label>
            <TagsReadout draft={draft} tags={preview} testId="own-version-preview" />
          </div>

          {problems.length > 0 && (
            <Alert data-testid="own-version-problems">
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
            <Alert variant="destructive" data-testid="own-version-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>
            Cancel
          </Button>
          <Button
            onClick={() => void publish()}
            disabled={publishing || problems.length > 0}
            data-testid="own-version-publish"
          >
            {publishing ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> {progressLabel(progress)}
              </>
            ) : current ? (
              "Publish changes"
            ) : (
              "Publish my version"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
