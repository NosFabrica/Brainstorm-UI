/**
 * An item as the app would draw it under a definition held in hand — the
 * real renderers (ADR 0004), not a likeness: its page, its results card, and
 * its row in a list. Below them, the raw addresses its URL templates build,
 * so a link button's destination is there to read as templates, bindings and
 * values change.
 *
 * The card and the row link to the item's own page, which a preview has none
 * of: they're shown, not followed.
 */
import { useState } from "react";
import type { NostrEvent } from "nostr-tools";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DListItemCardPreview } from "@/components/dictionary/DListItemCard";
import { DListItemRow } from "@/components/dictionary/DListItemRow";
import { DListItemHeroPreview } from "@/components/share/DListItemHero";
import { useLinkTemplates } from "@/hooks/useLinkTemplates";
import type { ResolvedConcept } from "@/lib/conceptResolution";
import { linkReadouts, type LinkReadout } from "@/lib/listDraft";

const VIEWS = ["page", "card", "row"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { page: "Item page", card: "Results card", row: "List row" };

export function ItemPreview({
  resolved,
  item,
  testId = "item-preview",
}: {
  resolved: ResolvedConcept;
  item: NostrEvent;
  testId?: string;
}) {
  const [view, setView] = useState<View>("page");
  const templates = useLinkTemplates(resolved.governing.links);
  const readouts = linkReadouts(resolved.governing, item, templates.data ?? new Map());
  return (
    <div className="space-y-3" data-testid={testId}>
      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList>
          {VIEWS.map((v) => (
            <TabsTrigger key={v} value={v} data-testid={`${testId}-view-${v}`}>
              {VIEW_LABEL[v]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        {view === "page" ? (
          <DListItemHeroPreview event={item} resolved={resolved} />
        ) : view === "card" ? (
          <div className="pointer-events-none max-w-sm">
            <DListItemCardPreview event={item} resolved={resolved} />
          </div>
        ) : (
          <ul className="pointer-events-none divide-y divide-border rounded-xl border border-border">
            <DListItemRow item={item} resolved={resolved} />
          </ul>
        )}
      </div>
      {readouts.length > 0 && <LinkReadouts readouts={readouts} testId={`${testId}-links`} />}
    </div>
  );
}

const PROBLEM: Record<NonNullable<LinkReadout["problem"]>, string> = {
  loading: "Reading the template…",
  invalid: "Not a usable template: it must start with https://host/ and use only {name} placeholders.",
  missing: "No address yet: every placeholder needs a value.",
};

/** Each URL template, what fills its placeholders, and the address it builds. */
function LinkReadouts({ readouts, testId }: { readouts: LinkReadout[]; testId: string }) {
  return (
    <section className="space-y-1.5" data-testid={testId}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Links, as they expand</p>
      <ul className="divide-y divide-border rounded-xl border border-border text-xs">
        {readouts.map((r) => (
          <li key={r.templateId} className="space-y-1 px-3 py-2" data-testid={`${testId}-${r.templateId.slice(0, 8)}`}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-slate-900 dark:text-slate-100">{r.name ?? "URL template"}</span>
              <code className="break-all font-mono text-slate-500 dark:text-slate-400">
                {r.template ?? `${r.templateId.slice(0, 12)}…`}
              </code>
            </div>
            <p className="break-all font-mono text-slate-500 dark:text-slate-400">
              {r.bindings.map((b) => `{${b.placeholder}} ← ${b.field} = ${b.value ?? "—"}`).join("  ·  ")}
            </p>
            {r.href ? (
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="block break-all font-mono text-brand-link hover:underline"
                data-testid={`${testId}-href`}
              >
                {r.href}
              </a>
            ) : (
              <p className="text-slate-400 dark:text-slate-500">{PROBLEM[r.problem ?? "missing"]}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
