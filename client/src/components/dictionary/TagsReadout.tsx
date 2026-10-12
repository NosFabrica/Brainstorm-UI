/**
 * The tags a definition will publish, as written — and, before them, the URL
 * templates drafted for it (lib/templateDrafts), which go first. A link to a
 * drafted template shows where its id will go: the id is the signed event's,
 * known only once it's signed (lib/listPublish).
 */
import { Chip } from "@/components/ui/chip";
import type { CopyDraft } from "@/lib/conceptCopy";
import { LINK_TAG } from "@/lib/linkTemplates";
import { templateItem, templatesToPublish } from "@/lib/templateDrafts";

export function TagsReadout({ draft, tags, testId }: { draft: CopyDraft; tags: string[][]; testId: string }) {
  const first = templatesToPublish(draft);
  const named = new Map(draft.templates.map((t) => [t.id, t.name.trim() || "the new template"]));
  const shown = (t: string[]) =>
    t[0] === LINK_TAG && named.has(t[1]) ? [t[0], `‹id of ${named.get(t[1])}›`, ...t.slice(2)] : t;
  return (
    <div className="space-y-2" data-testid={testId}>
      {first.map((t) => (
        <div key={t.id} className="space-y-1" data-testid={`${testId}-template`}>
          <Chip tone="accent" size="sm">
            New URL template · kind 9999 · published first
          </Chip>
          <Tags tags={templateItem(t).tags} />
        </div>
      ))}
      <div className="space-y-1">
        {first.length > 0 && (
          <Chip tone="slate" size="sm">
            Then the list
          </Chip>
        )}
        <Tags tags={tags.map(shown)} testId={`${testId}-header`} />
      </div>
    </div>
  );
}

function Tags({ tags, testId }: { tags: string[][]; testId?: string }) {
  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-slate-50 p-2.5 dark:bg-slate-900"
      data-testid={testId}
    >
      {tags.map((t, i) => (
        <code
          key={i}
          className="min-w-0 break-all rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:text-slate-300"
        >
          {JSON.stringify(t)}
        </code>
      ))}
    </div>
  );
}
