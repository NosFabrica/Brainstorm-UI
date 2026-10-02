/**
 * A list item on its own page — a GitHub account, say — drawn from its
 * concept's governing definition (ADR 0004), never from tags it happens to
 * carry. The definition says which fields an item has; the reader's own copy
 * of the concept, when they hold one, is the definition (useItemConcept).
 *
 * - The kicker names the concept: "GitHub Account · in GitHub Accounts".
 * - Title, summary, picture and the list's image as lib/itemPresentation
 *   reads them: the definition's provisional display hints, else the
 *   renderer's title field, else the first required field.
 * - Every declared field, in the definition's order; a required one the item
 *   lacks says so.
 * - Where the definition comes from, and whether it agrees with the
 *   community's.
 * - Tags the definition doesn't declare are the item author's own additions:
 *   folded away and labelled as outside the definition, not mixed in.
 *
 * The author, the time and the ids are EventScreen's, above and around this.
 */
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { BookOpen, ChevronDown, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { AgreementChip } from "@/components/dictionary/AgreementChip";
import { useItemConcept } from "@/hooks/useItemConcept";
import { useHasSession } from "@/hooks/useHasSession";
import { fieldCell, undeclaredFields, type FieldDecl } from "@/lib/dlistFields";
import { rendererFor } from "@/lib/conceptRenderers";
import { presentItem } from "@/lib/itemPresentation";
import { itemLinks } from "@/lib/linkTemplates";
import { useLinkTemplates } from "@/hooks/useLinkTemplates";
import { DISPLAY_HINTS_ENABLED } from "@/config/dictionary";
import { avatarSrc } from "@/lib/avatarSrc";
import type { DefinitionSource, ResolvedConcept } from "@/lib/conceptResolution";
import { dictionaryConceptOf } from "@/services/dictionary";

type ItemEvent = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

const SOURCE_WORDS: Record<DefinitionSource, string> = {
  personal: "your own copy of",
  assistant: "your Assistant's copy of",
  house: "Brainstorm's copy of",
  community: "the community concept",
};

export function DListItemHero({ event }: { event: ItemEvent }) {
  const concept = useItemConcept(event);
  const resolved = concept.data ?? null;

  if (concept.isPending)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400" data-testid="dlist-item-hero">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading what this list says its items are…
      </p>
    );

  if (!resolved) return <Undefined event={event} />;
  return <Defined event={event} resolved={resolved} />;
}

function Defined({ event, resolved: r }: { event: ItemEvent; resolved: ResolvedConcept }) {
  const renderer = rendererFor(r);
  const fields = r.governing.fields;
  const cells = fields.map((f) => ({ field: f, cell: fieldCell(event, f) }));
  const valueOf = (name: string) => cells.find((c) => c.field.name === name)?.cell.value ?? null;
  const shown = presentItem(event, r.governing, renderer);
  // Links from data when the definition names URL templates (provisional); otherwise the
  // registered renderer's — the fallback for definitions with no `link` tag yet.
  const refs = DISPLAY_HINTS_ENABLED ? r.governing.links : [];
  const templates = useLinkTemplates(refs);
  const links: { label: string; href: string; source: "template" | "renderer" }[] = refs.length
    ? itemLinks(event, refs, templates.data ?? new Map()).map((l) => ({ ...l, source: "template" as const }))
    : (renderer?.links?.(valueOf) ?? []).map((l) => ({ ...l, source: "renderer" as const }));
  const extras = undeclaredFields(event, fields);

  return (
    <div className="space-y-5" data-testid="dlist-item-hero" data-renderer={renderer?.key ?? "generic"}>
      <div>
        <p className="inline-flex flex-wrap items-center gap-x-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          {shown.listImage ? (
            <img
              src={avatarSrc(shown.listImage, "sm")}
              alt=""
              className="h-4 w-4 rounded-sm object-contain"
              data-testid="dlist-item-list-image"
            />
          ) : (
            <BookOpen className="h-3.5 w-3.5" />
          )}{" "}
          {r.governing.singular}
          <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
            in <ConceptLink event={event}>{r.governing.plural}</ConceptLink>
          </span>
        </p>
        <div className="mt-2 flex items-center gap-3">
          {shown.image && (
            <img
              src={avatarSrc(shown.image, "lg")}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
              data-testid="dlist-item-image"
            />
          )}
          <h1
            className="min-w-0 break-words text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="dlist-item-title"
          >
            {shown.title ?? <span className="text-slate-400">Untitled {r.governing.singular.toLowerCase()}</span>}
          </h1>
        </div>
        {shown.summary && (
          <p
            className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300"
            data-testid="dlist-item-summary"
          >
            {shown.summary}
          </p>
        )}
        {links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
                data-testid="dlist-item-link"
                data-link-source={l.source}
                title={l.href}
              >
                <ExternalLink className="h-4 w-4" /> {l.label}
                {l.source === "template" && <span className="font-normal text-white/70">· {new URL(l.href).host}</span>}
              </a>
            ))}
          </div>
        )}
      </div>

      <FieldList cells={cells} />

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          Shown as {SOURCE_WORDS[r.source]} <ConceptLink event={event}>{r.governing.plural}</ConceptLink>.
        </span>
        <AgreementChip agreement={r.agreement} />
      </p>

      {extras.length > 0 && <Extras extras={extras} singular={r.governing.singular} />}
    </div>
  );
}

function FieldList({ cells }: { cells: { field: FieldDecl; cell: ReturnType<typeof fieldCell> }[] }) {
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

function Extras({ extras, singular }: { extras: { name: string; value: string }[]; singular: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-link dark:text-slate-400"
        data-testid="dlist-item-extras-toggle"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {extras.length} more {extras.length === 1 ? "detail" : "details"} the author added, outside the {singular}{" "}
        definition
      </button>
      {open && (
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

/** The concept's Dictionary entry for a signed-in reader; plain words for anyone else (Settings needs a Session). */
function ConceptLink({ event, children }: { event: ItemEvent; children: ReactNode }) {
  const hasSession = useHasSession();
  const coordinate = dictionaryConceptOf(event);
  if (!hasSession || !coordinate) return <>{children}</>;
  return (
    <Link
      href={`/settings?tab=dictionary&concept=${encodeURIComponent(coordinate)}`}
      className="text-brand-link hover:underline"
    >
      {children}
    </Link>
  );
}

/** No definition could be read: say so, and show what the item carries without pretending to know its shape. */
function Undefined({ event }: { event: ItemEvent }) {
  const extras = undeclaredFields(event, []);
  return (
    <div className="space-y-3" data-testid="dlist-item-hero" data-renderer="none">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        This is an item in a list whose definition couldn&rsquo;t be read, so its fields can&rsquo;t be shown as the
        list means them. What it carries:
      </p>
      <dl className="divide-y divide-dashed divide-border rounded-xl border border-dashed border-border">
        {extras.map((x, i) => (
          <div key={`${x.name}-${i}`} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2">
            <dt className="w-40 shrink-0 font-mono text-xs text-slate-400">{x.name}</dt>
            <dd className="min-w-0 flex-1 break-words text-sm text-slate-600 dark:text-slate-300">{x.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
