/**
 * The parts of a list item's page every view shares, tier two
 * (DListItemHero) and tier three (components/items) alike — ADR 0007:
 * the kicker's link to the concept, the "More fields" fold, and the quiet
 * last line saying which definition drew the page.
 */
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { AgreementChip } from "@/components/dictionary/AgreementChip";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useDictionaryConcepts } from "@/hooks/useDictionaryConcepts";
import { dictionaryConceptOf } from "@/services/dictionary";
import { fieldCell, type FieldDecl } from "@/lib/dlistFields";
import type { DefinitionSource, ResolvedConcept } from "@/lib/conceptResolution";

export type ItemEvent = {
  id: string;
  kind: number;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
};

export type FieldCells = { field: FieldDecl; cell: ReturnType<typeof fieldCell> }[];

const SOURCE_WORDS: Record<DefinitionSource, string> = {
  personal: "your own copy of",
  assistant: "your Assistant's copy of",
  house: "Brainstorm's copy of",
  community: "the community concept",
};

/** Last and quietest: where the definition comes from, and whether it agrees with the community's. */
export function DefinitionLine({ event, resolved: r }: { event: ItemEvent; resolved: ResolvedConcept }) {
  return (
    <p
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-400 dark:text-slate-500"
      data-testid="dlist-item-definition"
    >
      <span>
        Shown as {SOURCE_WORDS[r.source]} <ConceptLink event={event}>{r.governing.plural}</ConceptLink>.
      </span>
      <AgreementChip agreement={r.agreement} />
    </p>
  );
}

/**
 * The concept's Dictionary entry for an admin; plain words for anyone else —
 * the Dictionary is admins-only while it's an internal demo (SettingsPage
 * `ADMIN_ONLY_TABS`), and the admin claim rides on a Session.
 */
export function ConceptLink({ event, children }: { event: ItemEvent; children: ReactNode }) {
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;
  // Infrastructure (URL Templates) renders, but has no Dictionary entry to link to.
  const { shown } = useDictionaryConcepts();
  const coordinate = dictionaryConceptOf(event, shown);
  if (!isAdmin || !coordinate) return <>{children}</>;
  return (
    <Link
      href={`/settings?tab=dictionary&concept=${encodeURIComponent(coordinate)}`}
      className="text-brand-link hover:underline"
    >
      {children}
    </Link>
  );
}

function FieldList({ cells }: { cells: FieldCells }) {
  if (cells.length === 0) return null;
  return (
    <dl className="divide-y divide-border rounded-xl border border-border" data-testid="dlist-item-fields">
      {cells.map(({ field, cell }) => (
        <div key={field.name} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2.5">
          <dt
            className="w-40 shrink-0 text-xs text-slate-500 dark:text-slate-400"
            title={field.description ?? undefined}
          >
            <code className="font-mono">{field.name}</code>
          </dt>
          <dd className="min-w-0 flex-1 break-words text-sm text-slate-900 dark:text-slate-100">
            {cell.value == null ? (
              cell.missing ? (
                <Chip tone="warning" icon={TriangleAlert} size="sm">
                  Missing — the list requires it
                </Chip>
              ) : (
                <span className="text-slate-400">—</span>
              )
            ) : cell.href ? (
              <a href={cell.href} target="_blank" rel="noopener noreferrer" className="text-brand-link hover:underline">
                {cell.value}
              </a>
            ) : (
              cell.value
            )}
            {cell.extra > 0 && <span className="ml-2 text-xs text-slate-400">+{cell.extra} more</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What the definition doesn't show: declared fields no title, summary, picture
 * or link uses, then tags the item carries that the definition never declared.
 * Folded away; an item the definition fully covers has none and shows nothing.
 */
export function MoreFields({
  cells,
  extras,
  singular,
}: {
  cells: FieldCells;
  extras: { name: string; value: string }[];
  singular: string;
}) {
  const [open, setOpen] = useState(false);
  if (cells.length === 0 && extras.length === 0) return null;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-link dark:text-slate-400"
        data-testid="dlist-item-more-toggle"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        More fields ({cells.length + extras.length})
      </button>
      {open && <FieldList cells={cells} />}
      {open && extras.length > 0 && (
        <p className="pt-1 text-[11px] text-slate-400 dark:text-slate-500">Not part of the {singular} definition</p>
      )}
      {open && extras.length > 0 && (
        <dl
          className="divide-y divide-dashed divide-border rounded-xl border border-dashed border-border"
          data-testid="dlist-item-extras"
        >
          {extras.map((x, i) => (
            <div key={`${x.name}-${i}`} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2">
              <dt className="w-40 shrink-0 font-mono text-xs text-slate-400">{x.name}</dt>
              <dd className="min-w-0 flex-1 break-words text-sm text-slate-600 dark:text-slate-300">{x.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
