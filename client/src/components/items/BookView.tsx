/**
 * A book on its own page (ADR 0007, tier three) — the way a bookshop shows
 * one: the cover large on the left, the title and the author leading, the
 * readers' rating under them, then what it's about, the subjects, who you
 * trust that stands behind it, and more books from the same list.
 *
 * Everything the item says is on screen before anything is asked
 * (lib/books: cover, title, author, year, pages, language, subjects). Open
 * Library adds the subtitle, the description, the publisher and the rating
 * through our origin (hooks/useBookFacts, services/openLibrary), only on
 * this page; a search never asks. The buttons are the definition's
 * templates — Open Library, Goodreads, a shop — so a header that names
 * none gives none. Readers see the book; the concept kicker and the field
 * fold are the admin's.
 */
import { useState } from "react";
import { BookOpen, Library, Star, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Favicon } from "@/components/share/LinkPreview";
import { DListItemNeighbours } from "@/components/dictionary/DListItemNeighbours";
import { AdminDefinition, ConceptLink, type FieldCells, type ItemEvent } from "@/components/share/DListItemParts";
import { useNetworkView, WhoStandsBehindIt } from "@/components/items/WhoStandsBehindIt";
import { useRankedReviews } from "@/components/items/PlaceReviews";
import { BookReviews } from "@/components/items/BookReviews";
import { ratingSummary } from "@/lib/placeReviews";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useBookFacts } from "@/hooks/useBookFacts";
import type { ReadyItemView } from "@/hooks/useItemView";
import { BOOK_FIELDS, bookOf } from "@/lib/books";
import { fieldCell, undeclaredFields } from "@/lib/dlistFields";
import { proxiedSrc } from "@/lib/imageProxy";

export { bookOf, bookPresentation } from "@/lib/books";

export function BookView({ event, view }: { event: ItemEvent; view: ReadyItemView }) {
  const { resolved: r, links, usedFields } = view;
  const book = bookOf(event, r.governing)!;
  const facts = useBookFacts(book).data ?? null;
  const [reading, setReading] = useState(false);
  const read = facts?.read ?? null;
  const canRead = read?.kind === "full" && !!read.ocaid;
  const network = useNetworkView(event);
  const ranked = useRankedReviews(event);
  const recommenders = network.ranked.filter((e) => e.group !== "other").length;
  // Stars alone are a rating; words are a review. Counted apart, as Open Library counts.
  const reviewCount = ranked.reviews.filter((r) => r.text).length;
  const ours = ratingSummary(ranked.reviews);
  const isAdmin = useActiveAccountDisplay()?.isAdmin === true;

  const meta = [
    book.year,
    (book.pages ?? facts?.pages) ? `${(book.pages ?? facts?.pages)!.toLocaleString()} pages` : null,
    book.language,
    facts?.publisher,
  ].filter(Boolean);

  // The admin's fold: declared fields the page doesn't show, and tags outside the definition.
  const used = new Set([...usedFields, ...Object.values(BOOK_FIELDS)]);
  const unshown: FieldCells = r.governing.fields
    .map((field) => ({ field, cell: fieldCell(event, field) }))
    .filter((c) => !used.has(c.field.name) && c.cell.value != null);
  const extras = undeclaredFields(event, r.governing.fields);

  return (
    <div className="space-y-6" data-testid="dlist-item-hero" data-definition="read" data-view="book">
      {isAdmin && (
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-brand-primary">
          <ConceptLink event={event}>{r.governing.singular}</ConceptLink>
        </p>
      )}

      {/* The shop window: the cover on a soft band, the words beside it. On a phone the rating, the
          trust line and the facts drop under the cover, where they have the whole width. */}
      <section
        className="-mx-4 -mt-4 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-5 gap-y-3 rounded-t-2xl bg-gradient-to-br from-brand-primary/10 via-slate-50 to-brand-accent/10 px-4 pb-5 pt-5 dark:from-brand-primary/20 dark:via-slate-900 dark:to-brand-accent/10 sm:-mx-5 sm:-mt-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-7 sm:px-6 sm:pb-6 sm:pt-6"
        data-testid="book-hero"
      >
        <div className="sm:row-span-2">
          <Cover src={book.cover} title={book.title} />
        </div>
        <div className="min-w-0 self-center">
          <h1
            className="break-words text-2xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
            data-testid="book-title"
          >
            {book.title}
          </h1>
          {facts?.subtitle && (
            <p className="mt-1 text-[15px] leading-snug text-slate-600 dark:text-slate-300" data-testid="book-subtitle">
              {facts.subtitle}
            </p>
          )}
          {book.author && (
            <p className="mt-2 text-lg text-slate-800 dark:text-slate-200" data-testid="book-author">
              <span className="text-slate-500 dark:text-slate-400">by </span>
              <span className="font-semibold">{book.author}</span>
            </p>
          )}
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
          {facts?.rating && <Rating average={facts.rating.average} count={facts.rating.count} />}
          {/* The line a shop can't write: who you trust stands behind it, and what they thought. */}
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300" data-testid="book-trust-line">
            <a href="#book-verdict" className="hover:text-brand-link">
              {recommenders > 0
                ? `Recommended by ${recommenders} ${recommenders === 1 ? "person" : "people"} you trust`
                : "No one you trust has recommended it yet"}
            </a>
            <span className="text-slate-300 dark:text-slate-600"> · </span>
            <a href="#book-reviews" className="hover:text-brand-link">
              {[
                ours
                  ? `Rated ${ours.average.toFixed(1)} by ${ours.count} ${ours.count === 1 ? "person" : "people"}`
                  : null,
                reviewCount > 0 ? `${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "No reviews yet"}
            </a>
          </p>
          {meta.length > 0 && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400" data-testid="book-meta">
              {meta.join(" · ")}
            </p>
          )}
        </div>
      </section>

      {/* Reading first — right here when a public-domain scan exists, else borrowing on the Internet
          Archive — then the definition's templates: the canonical page, reviews, a shop. */}
      {(read || links.length > 0) && (
        <div className="flex flex-wrap gap-2" data-testid="book-actions">
          {canRead && (
            <button type="button" onClick={() => setReading((v) => !v)} aria-expanded={reading} className={pill(true)}>
              <BookOpen className="h-4 w-4" />
              Read it here
            </button>
          )}
          {read && !canRead && (
            <a href={read.url} target="_blank" rel="noopener noreferrer nofollow" className={pill(true)}>
              <Library className="h-4 w-4" />
              Borrow on Internet Archive
            </a>
          )}
          {links.map((l, i) => {
            const primary = i === 0 && !read;
            return (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={pill(primary)}
              >
                <Favicon host={l.host} className={`h-4 w-4 rounded-sm ${primary ? "brightness-0 invert" : ""}`} />
                {l.label}
              </a>
            );
          })}
        </div>
      )}

      {reading && canRead && read.ocaid && (
        <section className="space-y-2" data-testid="book-reader">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
              Reading on the Internet Archive
            </p>
            <button
              type="button"
              onClick={() => setReading(false)}
              aria-label="Close the reader"
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <iframe
            src={`https://archive.org/embed/${encodeURIComponent(read.ocaid)}`}
            title={`${book.title}, on the Internet Archive`}
            allowFullScreen
            className="aspect-[4/5] w-full rounded-xl border border-border bg-slate-100 dark:bg-slate-900 sm:aspect-[4/3]"
          />
        </section>
      )}

      <WhoStandsBehindIt network={network} noun="book" idPrefix="book" voice="recommend" />

      {facts?.description && <Description text={facts.description} />}

      {book.subjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="book-subjects">
          {book.subjects.map((s) => (
            <Chip key={s} tone="slate" size="sm">
              {s}
            </Chip>
          ))}
        </div>
      )}

      <BookReviews item={event} ranked={ranked} />

      <DListItemNeighbours event={event} resolved={r} alsoListed={false} />

      <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="book-attribution">
        Listed from Open Library. Cover and details © their publishers.
      </p>

      <AdminDefinition event={event} resolved={r} cells={unshown} extras={extras} />
    </div>
  );
}

/** A pill button: the first thing to do in brand colour, the rest outlined. */
const pill = (primary: boolean) =>
  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
    primary
      ? "bg-brand-primary text-white hover:bg-brand-primary/90"
      : "border border-slate-200 bg-white text-slate-800 hover:border-brand-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
  }`;

/** The cover, portrait and shadowed as on a shelf; a book icon when the list gives none. */
function Cover({ src, title }: { src: string | null; title: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="w-28 shrink-0 sm:w-40">
      {src && !broken ? (
        <img
          src={proxiedSrc(src, "media_640")}
          referrerPolicy="no-referrer"
          alt={`Cover of ${title}`}
          onError={() => setBroken(true)}
          className="aspect-[2/3] w-full rounded-lg object-cover shadow-xl ring-1 ring-black/10 dark:ring-white/10"
          data-testid="book-cover"
        />
      ) : (
        <div
          className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-slate-200 text-slate-400 shadow-xl ring-1 ring-black/10 dark:bg-slate-800 dark:text-slate-500"
          data-testid="book-cover-missing"
        >
          <BookOpen className="h-10 w-10" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/** Five stars filled to the average, the number beside them: how readers on Open Library rated it. */
function Rating({ average, count }: { average: number; count: number }) {
  const rounded = Math.round(average * 10) / 10;
  const label = `Rated ${rounded} out of 5 by ${count.toLocaleString()} readers on Open Library`;
  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
      aria-label={label}
      data-testid="book-rating"
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-4 w-4 ${n <= Math.round(average) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"}`}
          />
        ))}
      </span>
      <span className="font-semibold text-slate-800 dark:text-slate-200">{rounded.toFixed(1)}</span>
      <span className="text-slate-500 dark:text-slate-400">
        {count.toLocaleString()} {count === 1 ? "rating" : "ratings"} on Open Library
      </span>
    </p>
  );
}

const CLAMP_AT = 420;

/** What the book is about, folded after a few lines until the reader wants the rest. */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > CLAMP_AT;
  return (
    <section data-testid="book-description">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
        About this book
      </p>
      <p
        className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 ${long && !open ? "line-clamp-5" : ""}`}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 text-sm font-medium text-brand-link hover:underline"
          data-testid="book-description-more"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}
