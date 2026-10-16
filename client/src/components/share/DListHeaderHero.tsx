/**
 * A Decentralized List's header (kind 39998, or 9998) on its own page, as
 * the list it is: its picture, its name, what it holds and the items filed
 * under it — read from our index (search.brainstorm.world) and the tag hub
 * beside it (services/dictionary `loadConceptItems`).
 *
 * This header is the definition its items are drawn by (DListItemRow, the
 * Dictionary's own row): the page is about this event, so the reader sees
 * the list as its author declared it, not a copy of it. Items show as they
 * are filed — the Dictionary is where they're narrowed to the reader's web
 * of trust.
 *
 * The header's own tags — its field declarations and hints — are behind
 * "Advanced view", in the tag table any structural event gets
 * (StructuralHero). Music lists keep their own header (DListHero).
 */
import { useMemo, useState, type ReactNode } from "react";
import { BookOpen, Braces, List, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { DListItemRow } from "@/components/dictionary/DListItemRow";
import { StructuralHero } from "@/components/share/StructuralHero";
import { EmojiText } from "@/components/ui/custom-emoji";
import { avatarSrc } from "@/lib/avatarSrc";
import { headerReference } from "@/lib/dlistFields";
import { useListItems } from "@/hooks/useConceptItems";
import { presentItem } from "@/lib/itemPresentation";
import { bLinksOf, resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";
import type { DictionaryItem } from "@/services/dictionary";

type HeaderLike = HeaderEvent & { content: string };

/** Rows drawn at first, and added per "Show more": a list of thousands draws a page at a time. */
const PAGE = 50;
/** A list this long gets a filter box. */
const FILTER_FROM = 10;

/**
 * This header as the governing definition of its own list. Its items are
 * those filed under it — by coordinate, or by id for a 9998 — and, for a
 * copy, under whatever it points at with `b`, as the Dictionary reads a
 * copy's list (services/dictionary `listHeaders`).
 */
export function ownDefinition(event: HeaderEvent): ResolvedConcept | null {
  const ref = headerReference(event);
  const r = ref ? resolveConcept({ community: event, communityCoordinate: ref }) : null;
  return r && ref ? { ...r, chain: [...new Set([ref, ...bLinksOf(event).map((b) => b.target)])] } : null;
}

export function DListHeaderHero({ event }: { event: HeaderLike }) {
  const [advanced, setAdvanced] = useState(false);
  const resolved = useMemo(() => ownDefinition(event), [event]);

  const toggle = (
    <button
      type="button"
      onClick={() => setAdvanced((v) => !v)}
      aria-pressed={advanced}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-brand-link dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
      data-testid="dlist-header-advanced-toggle"
    >
      {advanced ? (
        <>
          <List className="h-3.5 w-3.5" /> List view
        </>
      ) : (
        <>
          <Braces className="h-3.5 w-3.5" /> Advanced view
        </>
      )}
    </button>
  );

  if (!resolved) return <StructuralHero event={event} />;
  if (advanced)
    return (
      <div className="space-y-3" data-testid="dlist-header-advanced">
        <div className="flex justify-end">{toggle}</div>
        <StructuralHero event={event} />
      </div>
    );
  return <ListView resolved={resolved} toggle={toggle} />;
}

function ListView({ resolved, toggle }: { resolved: ResolvedConcept; toggle: ReactNode }) {
  const def = resolved.governing;
  const plural = def.plural.toLowerCase() || "items";
  const items = useListItems(resolved.chain);
  const all = items.data?.items ?? [];
  const truncated = items.data?.truncated === true;
  // A read cut off at its limit says so: the list holds at least this many.
  const count = `${all.length}${truncated ? "+" : ""} ${all.length === 1 && !truncated ? "item" : "items"}`;
  // What each item is made of, said in a line: the fields the list requires.
  const required = def.fields.filter((f) => f.requirement === "required").map((f) => f.name);

  return (
    <div className="space-y-5" data-testid="dlist-header-hero">
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
            List{" "}
            <span className="font-medium normal-case tracking-normal text-slate-400 dark:text-slate-500">
              of {plural}
            </span>
          </p>
          {toggle}
        </div>
        <div className="mt-3 flex items-center gap-4">
          <ListPicture image={def.display.listImage} />
          <div className="min-w-0 flex-1">
            <h1
              className="break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="dlist-header-title"
            >
              <EmojiText text={def.plural || "Untitled list"} tags={def.event} />
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" data-testid="dlist-header-count">
              {items.isPending ? "Reading its items…" : count}
            </p>
          </div>
        </div>
        {def.description && (
          <p
            className="mt-3 break-words text-[15px] leading-relaxed text-slate-600 dark:text-slate-300"
            data-testid="dlist-header-description"
          >
            <EmojiText text={def.description} tags={def.event} />
          </p>
        )}
        {required.length > 0 && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" data-testid="dlist-header-shape">
            Each {def.singular.toLowerCase() || "item"} has {listWords(required)}.
          </p>
        )}
      </div>

      {items.isPending ? (
        <p
          className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"
          data-testid="dlist-header-items-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the {plural}…
        </p>
      ) : all.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="dlist-header-items-none">
          Nothing is filed under this list yet.
        </p>
      ) : (
        <Items items={all} resolved={resolved} plural={plural} />
      )}
    </div>
  );
}

function Items({ items, resolved, plural }: { items: DictionaryItem[]; resolved: ResolvedConcept; plural: string }) {
  const def = resolved.governing;
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const q = query.trim().toLowerCase();
  // Filtered by what a row shows — its title and summary — so a match is one the reader can see.
  // Each item's text is worked out once per read, not on every keystroke.
  const haystacks = useMemo(
    () =>
      items.map((item) => {
        const p = presentItem(item, def);
        return [p.title, p.summary].filter(Boolean).join("\n").toLowerCase();
      }),
    [items, def],
  );
  const matching = useMemo(() => (q ? items.filter((_, i) => haystacks[i].includes(q)) : items), [items, haystacks, q]);
  const page = matching.slice(0, shown);

  return (
    <section className="space-y-3" data-testid="dlist-header-items">
      <SectionHeader kicker="Items" />
      {items.length > FILTER_FROM && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder={`Filter ${plural}`}
            aria-label={`Filter ${plural}`}
            className="pl-9"
            data-testid="dlist-header-filter"
          />
        </div>
      )}
      {matching.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="dlist-header-items-no-match">
          No {plural} match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {page.map((item) => (
            <DListItemRow key={item.id} item={item} resolved={resolved} />
          ))}
        </ul>
      )}
      {matching.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="text-xs font-medium text-slate-500 hover:text-brand-link hover:underline dark:text-slate-400"
          data-testid="dlist-header-show-more"
        >
          Show {Math.min(PAGE, matching.length - shown)} more of {matching.length - shown}
        </button>
      )}
    </section>
  );
}

/** The list's own image, on white as a logo sits; else — or once it fails to load — the plain mark. */
function ListPicture({ image }: { image: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
      {image && failed !== image ? (
        <img
          src={avatarSrc(image, "lg")}
          onError={() => setFailed(image)}
          alt=""
          className="h-full w-full bg-white object-contain"
          data-testid="dlist-header-image"
        />
      ) : (
        <BookOpen className="h-6 w-6" data-testid="dlist-header-plain-mark" />
      )}
    </span>
  );
}

/** ["a"] → "a"; ["a", "b"] → "a and b"; ["a", "b", "c"] → "a, b and c". */
function listWords(words: string[]): string {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
