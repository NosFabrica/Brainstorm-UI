/**
 * "Publish my own version" — a form for the reader's own copy of a community
 * concept (lib/conceptCopy), after dlist-ui's create-list: names,
 * description, and the fields its items carry, each required or optional.
 *
 * Rows start from the reader's current version, else the community's: the
 * community's fields (on), then fields the items carry that the definition
 * doesn't (off — "on 2 of 7 items"), then any the reader added. "+ Add a
 * field" makes another. The preview is the tags as they'll be published,
 * so a demo can show exactly what changed.
 *
 * A tester for now (config `versionTester`): it publishes with the reader's
 * own key, which outranks their Assistant's copy and the community's.
 */
import { useEffect, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  copyTemplate,
  draftProblems,
  initialDraft,
  type CopyDraft,
  type DraftDisplay,
  type DraftField,
} from "@/lib/conceptCopy";
import { DISPLAY_ROLES, type DisplayRole } from "@/lib/displayHints";
import { httpUrl } from "@/lib/dlistFields";

/** Radix Select can't hold an empty value: "no hint" needs a name of its own. */
const AUTO = "__auto";
const ROLE_LABEL: Record<DisplayRole, string> = { title: "Title", summary: "Summary", image: "Picture" };
import type { ConceptDefinition } from "@/lib/conceptResolution";
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
  const [error, setError] = useState<string | null>(null);

  // Each opening starts from what's published now, not from an abandoned edit.
  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(community, current, items));
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = draftProblems(draft);
  const preview = copyTemplate(community, draft).tags;
  const total = items.length;

  const setField = (i: number, patch: Partial<DraftField>) =>
    setDraft((d) => ({ ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));
  const addField = () =>
    setDraft((d) => ({ ...d, fields: [...d.fields, { name: "", enabled: true, required: false, origin: "custom" }] }));
  const removeField = (i: number) => setDraft((d) => ({ ...d, fields: d.fields.filter((_, j) => j !== i) }));
  const setDisplay = (patch: Partial<DraftDisplay>) => setDraft((d) => ({ ...d, display: { ...d.display, ...patch } }));
  // A role can only name a field this version declares; a disabled field drops back to Automatic.
  const enabledNames = draft.fields.filter((f) => f.enabled && f.name.trim()).map((f) => f.name.trim());

  const publish = async () => {
    if (publishing || problems.length) return;
    setPublishing(true);
    setError(null);
    try {
      await publishOwnCopy(community, draft);
      onPublished();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="own-plural">List name (plural)</Label>
              <Input
                id="own-plural"
                value={draft.plural}
                onChange={(e) => setDraft((d) => ({ ...d, plural: e.target.value }))}
                data-testid="own-version-plural"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="own-singular">Item name (singular)</Label>
              <Input
                id="own-singular"
                value={draft.singular}
                onChange={(e) => setDraft((d) => ({ ...d, singular: e.target.value }))}
                data-testid="own-version-singular"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="own-description">Description</Label>
            <Textarea
              id="own-description"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              data-testid="own-version-description"
            />
          </div>

          <div className="space-y-2">
            <Label>Item fields</Label>
            <ul className="divide-y divide-border rounded-xl border border-border" data-testid="own-version-fields">
              {draft.fields.map((f, i) => (
                <li
                  key={i}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 ${f.enabled ? "" : "opacity-60"}`}
                  data-testid={`own-version-field-${i}`}
                >
                  <Checkbox
                    checked={f.enabled}
                    onCheckedChange={(v) => setField(i, { enabled: v === true })}
                    aria-label={`Include ${f.name || "this field"}`}
                    data-testid="own-version-field-enabled"
                  />
                  {f.origin === "custom" ? (
                    <Input
                      value={f.name}
                      onChange={(e) => setField(i, { name: e.target.value })}
                      placeholder="field name"
                      className="h-8 w-44 font-mono text-sm"
                      aria-label="Field name"
                      data-testid="own-version-field-name"
                    />
                  ) : (
                    <code className="font-mono text-sm text-slate-900 dark:text-slate-100">{f.name}</code>
                  )}
                  {f.origin === "definition" && (
                    <Chip tone="slate" size="sm">
                      community
                    </Chip>
                  )}
                  {f.origin === "items" && (
                    <Chip tone="slate" size="sm">
                      on {f.seenOn} of {total} items
                    </Chip>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <Checkbox
                      id={`own-required-${i}`}
                      checked={f.required}
                      disabled={!f.enabled}
                      onCheckedChange={(v) => setField(i, { required: v === true })}
                      data-testid="own-version-field-required"
                    />
                    <label htmlFor={`own-required-${i}`} className="w-16 text-xs text-slate-600 dark:text-slate-300">
                      {f.required ? "Required" : "Optional"}
                    </label>
                    {f.origin === "custom" && (
                      <button
                        type="button"
                        onClick={() => removeField(i)}
                        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                        aria-label="Remove field"
                        data-testid="own-version-field-remove"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={addField} data-testid="own-version-add-field">
              <Plus className="mr-1 h-3.5 w-3.5" /> Add a field
            </Button>
          </div>

          <div className="space-y-2" data-testid="own-version-display">
            <Label className="flex items-center gap-2">
              How items read
              <Chip tone="slate" size="sm">
                provisional
              </Chip>
            </Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {DISPLAY_ROLES.map((role) => (
                <div key={role} className="space-y-1">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABEL[role]}</span>
                  <Select
                    value={enabledNames.includes(draft.display[role] ?? "") ? draft.display[role]! : AUTO}
                    onValueChange={(v) => setDisplay({ [role]: v === AUTO ? null : v })}
                  >
                    <SelectTrigger className="h-8 font-mono text-xs" data-testid={`own-version-display-${role}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>{role === "image" ? "None" : "Automatic"}</SelectItem>
                      {enabledNames.map((n) => (
                        <SelectItem key={n} value={n} className="font-mono text-xs">
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="own-list-image" className="text-xs font-normal text-slate-500 dark:text-slate-400">
                List image (a URL every item wears, e.g. a logo)
              </Label>
              <div className="flex items-center gap-2">
                {httpUrl(draft.display.listImage) && (
                  <img
                    src={httpUrl(draft.display.listImage)!}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-md border border-border object-contain"
                  />
                )}
                <Input
                  id="own-list-image"
                  value={draft.display.listImage}
                  onChange={(e) => setDisplay({ listImage: e.target.value })}
                  placeholder="https://…"
                  className="h-8 text-sm"
                  data-testid="own-version-list-image"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Preview</Label>
            <div
              className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-900"
              data-testid="own-version-preview"
            >
              {preview.map((t, i) => (
                <code
                  key={i}
                  className="min-w-0 break-all rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300"
                >
                  {JSON.stringify(t)}
                </code>
              ))}
            </div>
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
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Publishing…
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
