/**
 * Adding an item to a list (lib/listItem): an input per field of the
 * definition it's previewed under, typed and marked by that definition, the
 * item drawn by the real renderers as it's filled in (ItemPreview), and a
 * switch between every definition a reader could see it by — the list's own,
 * Brainstorm's copy, an Assistant's, one's own (useListDefinitions). It opens
 * on the one that governs for the author.
 *
 * Values belong to field names, so switching definitions keeps them; a value
 * for a field the shown definition doesn't declare stays on the item and is
 * said so. The item is always filed under the list itself, and what the list
 * requires is what has to be filled in to publish.
 */
import { useMemo, useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemFieldInputs } from "@/components/lists/ItemFieldInputs";
import { ItemPreview } from "@/components/lists/ItemPreview";
import { dictionaryRelays } from "@/config/dictionary";
import { useListDefinitions } from "@/hooks/useListDefinitions";
import type { DefinitionSource } from "@/lib/conceptResolution";
import { itemProblems, itemTemplate, randomTail, type ItemValues } from "@/lib/listItem";
import { eventPath } from "@/lib/shareId";
import { publishListEvent } from "@/services/lists";

const SOURCE_LABEL: Record<DefinitionSource, string> = {
  community: "The list's own",
  house: "Brainstorm's copy",
  assistant: "Your Assistant's copy",
  personal: "Your version",
};

export function ItemComposer({ header, me }: { header: NostrEvent; me: string }) {
  const { definitions, governing } = useListDefinitions(header);
  const [chosen, setChosen] = useState<DefinitionSource | null>(null);
  const shown = definitions.find((d) => d.source === (chosen ?? governing)) ?? definitions[0];
  const list = definitions[0].resolved.governing;

  const [values, setValues] = useState<ItemValues>({});
  const [tail, setTail] = useState(randomTail);
  const template = useMemo(() => itemTemplate(list, values, tail), [list, values, tail]);
  const item = useMemo(
    () => ({
      id: "e".repeat(64),
      pubkey: me,
      kind: 39999,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      sig: "",
      tags: template.tags,
    }),
    [template, me],
  );
  const fields = shown.resolved.governing.fields;
  const elsewhere = Object.entries(values).filter(([name, v]) => v.trim() && !fields.some((f) => f.name === name));
  const problems = itemProblems(list, values);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<NostrEvent | null>(null);
  const publish = async () => {
    if (publishing || problems.length) return;
    setPublishing(true);
    setError(null);
    try {
      setAdded(await publishListEvent(template));
      setValues({});
      setTail(randomTail());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="item-composer">
      {definitions.length > 1 && (
        <div className="space-y-1.5">
          <Label>Preview it as</Label>
          <Tabs value={shown.source} onValueChange={(v) => setChosen(v as DefinitionSource)}>
            <TabsList className="flex-wrap">
              {definitions.map((d) => (
                <TabsTrigger key={d.source} value={d.source} data-testid={`item-composer-as-${d.source}`}>
                  {SOURCE_LABEL[d.source]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Readers like you see it as {SOURCE_LABEL[governing].toLowerCase()}.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <SectionHeader kicker={`A new ${shown.resolved.governing.singular.toLowerCase() || "item"}`} />
          <ItemFieldInputs
            fields={fields}
            values={values}
            onChange={(field, value) => setValues((v) => ({ ...v, [field]: value }))}
            testId="item-field"
          />
          {elsewhere.length > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="item-composer-elsewhere">
              Also carries {elsewhere.map(([name]) => name).join(", ")}, filled in under another definition.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>What it publishes</Label>
            <div
              className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-900"
              data-testid="item-composer-tags"
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

          {problems.length > 0 && (
            <Alert data-testid="item-composer-problems">
              <AlertDescription>{problems.join(" ")}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" data-testid="item-composer-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void publish()}
              disabled={publishing || problems.length > 0}
              data-testid="item-composer-publish"
            >
              {publishing ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Adding…
                </>
              ) : (
                `Add to ${list.plural}`
              )}
            </Button>
            {added && !publishing && (
              <Link
                href={eventPath(added, dictionaryRelays())}
                className="text-sm text-brand-link hover:underline"
                data-testid="item-composer-added"
              >
                Added — see its page
              </Link>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <SectionHeader kicker="Preview" />
          <ItemPreview resolved={shown.resolved} item={item} testId="item-composer-preview" />
        </div>
      </div>
    </div>
  );
}
