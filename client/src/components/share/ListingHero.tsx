import { useMemo, useState } from "react";
import { nip19 } from "nostr-tools";
import { ExternalLink, MapPin, MessageCircle, ShoppingBag, Truck } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Favicon } from "@/components/share/LinkPreview";
import { categoriesToShow, formatListingPrice, isSellable, parseListing } from "@/lib/listing";
import { sourceAppFor } from "@/lib/sourceApp";
import { secondPriceLine, viewerCurrency } from "@/lib/exchangeRate";
import { useBtcRates } from "@/hooks/useBtcRates";
import { nostrUriFor } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import { ReadingText } from "@/components/share/ReadingText";
import { FollowedByLine } from "@/components/search/EndorsementLine";
import { useActivePerspective } from "@/hooks/useActivePerspective";
import { useRecentByKinds } from "@/hooks/useRecentByKinds";
import { ListingOptions } from "@/components/share/ListingOptions";
import type { NostrEvent } from "nostr-tools";

type ListingEvent = Pick<NostrEvent, "id" | "pubkey" | "kind" | "created_at" | "tags">;

/** A description longer than this many characters opens folded. */
const DESCRIPTION_FOLD = 600;

/** How many categories a product page shows before "+N more". */
const CATEGORIES_SHOWN = 5;

/**
 * A kind-30402 listing on its event page: the photos, the price as the seller
 * wrote it, where it is, how it ships, the description with its links live —
 * and two ways to act. "Message seller" opens the seller in the reader's own
 * Nostr app, where their keys and conversations already live; the second
 * button goes to the listing's own page — "Buy on Conduit" when we know which
 * marketplace sold it, or "Visit <host>" on whatever link the seller
 * published. There is no checkout of ours: payment happens where
 * the seller sells.
 */
export function ListingHero({
  event,
  sellerWebsite,
  sellerName,
}: {
  event: MinimalEvent;
  /** The seller's name, when the page knows it: a category that only repeats it is not shown. */
  sellerName?: string | null;
  /** The seller's own website, from their profile — the way in when the listing names no shop and no app we know. */ sellerWebsite?:
    string | null;
}) {
  const l = parseListing({
    ...event,
    id: event.id,
    pubkey: event.pubkey,
    kind: event.kind,
    created_at: event.created_at,
    tags: event.tags,
    content: event.content ?? "",
  });
  const [photo, setPhoto] = useState(0);
  const [pov] = useActivePerspective();
  const sellerNpub = useMemo(() => {
    try {
      return nip19.npubEncode(event.pubkey);
    } catch {
      return "";
    }
  }, [event.pubkey]);
  // A long description opens folded: its start, and the rest on request.
  const [wholeStory, setWholeStory] = useState(false);
  // A handful of categories is enough to say what this is; the rest are one tap away.
  const [allCategories, setAllCategories] = useState(false);
  // The app that sold it wins over a stray shop link: that is where the
  // product actually lives and checks out.
  // A listing published outside Conduit by a seller who sells on Conduit still
  // opens there: the seller's other listings say whether they do.
  const sellerListings = useRecentByKinds(sourceAppFor(event) ? null : event.pubkey, [30402], 40)
    .events as MinimalEvent[];
  const app = sourceAppFor(event, { sellerListings });
  // The seller's price leads; what it is in the buyer's own money sits under it.
  const rates = useBtcRates();
  const websiteHost = (() => {
    try {
      return sellerWebsite && /^https?:\/\//i.test(sellerWebsite)
        ? new URL(sellerWebsite).hostname.replace(/^www\./, "")
        : null;
    } catch {
      return null;
    }
  })();
  if (!l) return null;
  const categories = categoriesToShow(l.categories, sellerName);
  const converted = l.price && rates ? secondPriceLine(l.price, rates, viewerCurrency()) : null;
  const text = l.description || l.summary || "";
  // Long enough that shipping, categories and the seller's other things are a scroll away.
  const long = text.length > DESCRIPTION_FOLD;
  const sellable = isSellable(l);
  // Sold, hidden, inactive: a status worth a chip. Merely priceless is not.
  const gone = !sellable && (l.status !== "active" || l.hidden);
  const shopHost = (() => {
    try {
      return l.shopUrl ? new URL(l.shopUrl).hostname.replace(/^www\./, "") : null;
    } catch {
      return null;
    }
  })();
  const current = l.images[Math.min(photo, Math.max(0, l.images.length - 1))];

  return (
    <div data-testid="listing-hero">
      {/* Gallery */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
        {current ? (
          <img
            src={current}
            alt=""
            className="absolute inset-0 h-full w-full bg-slate-900/5 object-contain"
            data-testid="listing-hero-photo"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <ShoppingBag className="h-10 w-10" />
          </span>
        )}
        {gone && (
          <span className="absolute right-3 top-3">
            <Chip tone="slate" size="sm" data-testid="listing-hero-status">
              {l.status === "sold" ? "Sold" : l.status}
            </Chip>
          </span>
        )}
      </div>
      {l.images.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" data-testid="listing-hero-thumbs">
          {l.images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setPhoto(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${i === photo ? "border-brand-primary" : "border-transparent hover:border-slate-300 dark:hover:border-slate-600"}`}
              aria-label={`Photo ${i + 1}`}
              data-testid={`listing-hero-thumb-${i}`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <h1
        className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl"
        style={{ fontFamily: "var(--font-display)" }}
        data-testid="listing-hero-title"
      >
        {l.title}
      </h1>

      {/* The price, in words, where a shopper looks for it: the seller's own
          price leads, the buyer's money beside it. */}
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5" data-testid="listing-hero-price-line">
        {l.price ? (
          <>
            <span
              className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100"
              data-testid="listing-hero-price"
            >
              {formatListingPrice(l.price)}
            </span>
            {converted && (
              <span
                className="text-sm tabular-nums text-slate-500 dark:text-slate-400"
                data-testid="listing-hero-price-converted"
              >
                {converted}
              </span>
            )}
          </>
        ) : (
          <span
            className="text-sm font-medium text-slate-500 dark:text-slate-400"
            data-testid="listing-hero-price-unknown"
          >
            Price on request
          </span>
        )}
      </p>

      {/* Who is selling, and who vouches for them: the reason to buy here. */}
      <div
        className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400"
        data-testid="listing-hero-seller"
      >
        {sellerName && (
          <span>
            Sold by <span className="font-semibold text-slate-700 dark:text-slate-200">{sellerName}</span>
          </span>
        )}
        <FollowedByLine pubkey={event.pubkey} npub={sellerNpub} personal={pov === "mywot"} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {l.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {l.location}
          </span>
        )}
      </div>

      {/* Where a shopper chooses: the product's options, right above the way to buy. */}
      <ListingOptions event={event as ListingEvent} className="mt-3" />

      {/* Actions — the seller's app and the seller's shop. */}
      <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="listing-hero-actions">
        <a
          href={nostrUriFor(event.pubkey)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          data-testid="listing-hero-message"
        >
          <MessageCircle className="h-4 w-4" /> Message seller
        </a>
        {app ? (
          <a
            href={app.url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            data-testid="listing-hero-shop"
            title={`Opens ${app.host} in a new tab`}
          >
            <img src={app.icon} alt="" className="h-3.5 w-3.5 rounded-sm" /> Buy on {app.name}{" "}
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </a>
        ) : l.shopUrl && shopHost ? (
          <a
            href={l.shopUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            data-testid="listing-hero-shop"
            title={`Opens ${shopHost} in a new tab`}
          >
            <Favicon host={shopHost} className="h-3.5 w-3.5" /> Visit {shopHost}{" "}
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </a>
        ) : websiteHost ? (
          // No shop on the listing and no marketplace we know (The Bitcoin
          // Shop UK, via Gamma Markets): the seller's own website is the way in.
          <a
            href={sellerWebsite!}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-brand-accent/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            data-testid="listing-hero-shop"
            title={`Opens ${websiteHost} in a new tab`}
          >
            <Favicon host={websiteHost} className="h-3.5 w-3.5" /> Visit {websiteHost}{" "}
            <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Messaging opens your Nostr app. Payment happens with the seller, in their app.
      </p>

      {l.shipping.length > 0 && (
        <div
          className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          data-testid="listing-hero-shipping"
        >
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Truck className="h-3.5 w-3.5" /> Shipping
          </p>
          <ul className="space-y-0.5 text-sm text-slate-700 dark:text-slate-200">
            {l.shipping.map((s, i) => (
              <li key={s.name + i} className="flex items-center justify-between gap-3">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                  {formatListingPrice({ amount: s.amount, currency: s.currency || l.price?.currency || "" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {text && (
        <div
          className="mt-4"
          data-collapsed={long && !wholeStory ? "true" : "false"}
          data-testid="listing-hero-description-box"
        >
          <div className={long && !wholeStory ? "relative max-h-56 overflow-hidden" : undefined}>
            <ReadingText text={text} testId="listing-hero-description" />
            {long && !wholeStory && (
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
                aria-hidden="true"
              />
            )}
          </div>
          {long && !wholeStory && (
            <button
              type="button"
              onClick={() => setWholeStory(true)}
              className="mt-1 text-sm font-semibold text-brand-link hover:underline"
              data-testid="listing-hero-description-more"
            >
              Read more
            </button>
          )}
        </div>
      )}

      {/* The seller's categories: how the listing is found, not what a buyer
          reads first — so under the story, a few at a time. */}
      {categories.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5" data-testid="listing-hero-categories">
          {(allCategories ? categories : categories.slice(0, CATEGORIES_SHOWN)).map((c) => (
            <Chip key={c} tone="slate" size="sm" data-testid="listing-hero-category">
              {c}
            </Chip>
          ))}
          {!allCategories && categories.length > CATEGORIES_SHOWN && (
            <button
              type="button"
              onClick={() => setAllCategories(true)}
              className="rounded-full px-1.5 py-0.5 text-[11px] font-medium text-brand-link hover:underline"
              data-testid="listing-hero-categories-more"
            >
              +{categories.length - CATEGORIES_SHOWN} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
