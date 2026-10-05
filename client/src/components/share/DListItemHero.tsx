/**
 * A list item on its own page — a GitHub account, say — drawn from its
 * concept's governing definition (ADR 0004), never from tags it happens to
 * carry. The definition says which fields an item has; the reader's own copy
 * of the concept, when they hold one, is the definition (useItemConcept).
 *
 * - The kicker names the concept: "GitHub Account · in GitHub Accounts".
 * - Title, summary, picture and the list's image as lib/itemPresentation
 *   reads them: the definition's provisional display hints, else the first
 *   required field.
 * - Its links (useItemView): its own `link` field, and those built from the
 *   URL templates the definition names. A definition that names neither gives
 *   no link — no concept has code of its own.
 * - Its `media` field, played: audio in the app's track card, video inline.
 * - A required field the item lacks, said once.
 * - Where the definition comes from, and whether it agrees with the
 *   community's.
 * - No catch-all table (the team, 2026-10-01): a field the title, summary,
 *   picture or a link already shows isn't listed again. Declared fields
 *   nothing shows, and tags outside the definition, fold into "More fields";
 *   an item the definition fully covers has none.
 *
 * The lister, the time and the ids are EventScreen's, around this.
 */
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { BookOpen, ChevronDown, ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { AgreementChip } from "@/components/dictionary/AgreementChip";
import { isReady, useItemView, type ReadyItemView } from "@/hooks/useItemView";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { fieldCell, undeclaredFields, type FieldDecl } from "@/lib/dlistFields";
import { avatarSrc } from "@/lib/avatarSrc";
import { EmbeddedTrackCard } from "@/components/share/EmbeddedTrackCard";
import { FeedVideo } from "@/components/share/FeedVideo";
import type { DefinitionSource } from "@/lib/conceptResolution";
import { dictionaryConceptOf } from "@/services/dictionary";

type ItemEvent = { id: string; kind: number; pubkey: string; created_at: number; content: string; tags: string[][] };

const SOURCE_WORDS: Record<DefinitionSource, string> = {
  personal: "your own copy of",
  assistant: "your Assistant's copy of",
  house: "Brainstorm's copy of",
  community: "the community concept",
};

export function DListItemHero({ event }: { event: ItemEvent }) {
  const view = useItemView(event);

  if (view.pending)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400" data-testid="dlist-item-hero">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading what this list says its items are…
      </p>
    );

  if (!isReady(view)) return <Undefined event={event} />;
  return <Defined event={event} view={view} />;
}

function Defined({ event, view }: { event: ItemEvent; view: ReadyItemView }) {
  const { resolved: r, shown, links, usedFields } = view;
  const fields = r.governing.fields;
  const cells = fields.map((f) => ({ field: f, cell: fieldCell(event, f) }));
  // Required by the definition, absent from the item — said once, wherever the field would show.
  const missing = cells.filter((c) => c.cell.missing).map((c) => c.field.name);
  // Declared fields nothing above shows, and tags outside the definition: both wait behind "More fields".
  const unshown = cells.filter((c) => !usedFields.has(c.field.name) && c.cell.value != null);
  const extras = undeclaredFields(event, fields);

  return (
    <div className="space-y-5" data-testid="dlist-item-hero" data-definition="read">
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
                title={l.href}
              >
                <ExternalLink className="h-4 w-4" /> {l.label}
                <span className="font-normal text-white/70">· {l.host}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {shown.media && (
        <div data-testid="dlist-item-media" data-media-kind={shown.media.kind}>
          {shown.media.kind === "audio" ? (
            // The app's own track card: it plays on the floor (lib/playback) — one sound at a time.
            <EmbeddedTrackCard
              id={`dlist:${event.id}`}
              title={shown.title ?? r.governing.singular}
              artist={shown.summary ?? undefined}
              cover={shown.image ?? shown.listImage ?? undefined}
              audio={shown.media.url}
              pageUrl={links[0]?.href}
            />
          ) : (
            <FeedVideo src={shown.media.url} poster={shown.image ?? undefined} className="w-full rounded-xl" />
          )}
        </div>
      )}

      {missing.length > 0 && (
        <Chip tone="warning" icon={TriangleAlert} size="sm" data-testid="dlist-item-missing">
          Missing {missing.join(", ")} — the list requires {missing.length === 1 ? "it" : "them"}
        </Chip>
      )}

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          Shown as {SOURCE_WORDS[r.source]} <ConceptLink event={event}>{r.governing.plural}</ConceptLink>.
        </span>
        <AgreementChip agreement={r.agreement} />
      </p>

      {(unshown.length > 0 || extras.length > 0) && (
        <MoreFields cells={unshown} extras={extras} singular={r.governing.singular} />
      )}
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

/**
 * What the definition doesn't show: declared fields no title, summary, picture
 * or link uses, then tags the item carries that the definition never declared.
 * Folded away; an item the definition fully covers has none and shows nothing.
 */
function MoreFields({
  cells,
  extras,
  singular,
}: {
  cells: { field: FieldDecl; cell: ReturnType<typeof fieldCell> }[];
  extras: { name: string; value: string }[];
  singular: string;
}) {
  const [open, setOpen] = useState(false);
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

/**
 * The concept's Dictionary entry for an admin; plain words for anyone else —
 * the Dictionary is admins-only while it's an internal demo (SettingsPage
 * `ADMIN_ONLY_TABS`), and the admin claim rides on a Session.
 */
function ConceptLink({ event, children }: { event: ItemEvent; children: ReactNode }) {
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;
  const coordinate = dictionaryConceptOf(event);
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

/** No definition could be read: say so, and show what the item carries without pretending to know its shape. */
function Undefined({ event }: { event: ItemEvent }) {
  const extras = undeclaredFields(event, []);
  return (
    <div className="space-y-3" data-testid="dlist-item-hero" data-definition="missing">
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
