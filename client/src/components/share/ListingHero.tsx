import { useState, useEffect } from "react";
import { ExternalLink, MapPin, MessageCircle, ShoppingBag, Truck } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { Favicon } from "@/components/share/LinkPreview";
import { formatListingPrice, isSellable, parseListing } from "@/lib/listing";
import { sourceAppFor } from "@/lib/sourceApp";
import { fetchRecentByKinds } from "@/services/nostr";
import { nostrUriFor } from "@/lib/shareId";
import type { MinimalEvent } from "@/lib/noteRefs";
import { ReadingText } from "@/components/share/ReadingText";

/**
 * A kind-30402 listing on its event page: the photos, the price as the seller
 * wrote it, where it is, how it ships, the description with its links live —
 * and two ways to act. "Message seller" opens the seller in the reader's own
 * Nostr app, where their keys and conversations already live; the second
 * button goes to the listing's own page — by the app's name ("Open in
 * Conduit") when we know which app sold it, or "Visit shop" on whatever link
 * the seller published. There is no checkout of ours: payment happens where
 * the seller sells.
 */
export function ListingHero({ event }: { event: MinimalEvent }) {
  const l = parseListing({ ...event, id: event.id, pubkey: event.pubkey, kind: event.kind, created_at: event.created_at, tags: event.tags, content: event.content ?? "" });
  const [photo, setPhoto] = useState(0);
  // The app that sold it wins over a stray shop link: that is where the
  // product actually lives and checks out.
  // A listing published outside Conduit by a seller who sells on Conduit still
  // opens there: the seller's other listings say whether they do.
  const [sellerListings, setSellerListings] = useState<MinimalEvent[]>([]);
  useEffect(() => {
    setSellerListings([]);
    if (sourceAppFor(event)) return;
    let alive = true;
    fetchRecentByKinds(event.pubkey, [30402], 40)
      .then((evs) => { if (alive) setSellerListings(evs as MinimalEvent[]); })
      .catch(() => {});
    return () => { alive = false; };
  }, [event.id, event.pubkey]); // eslint-disable-line react-hooks/exhaustive-deps
  const app = sourceAppFor(event, { sellerListings });
  if (!l) return null;
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
          <img src={current} alt="" className="absolute inset-0 h-full w-full object-contain bg-slate-900/5" data-testid="listing-hero-photo" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-slate-400 dark:text-slate-500">
            <ShoppingBag className="h-10 w-10" />
          </span>
        )}
        {l.price ? (
          <span className="absolute left-3 top-3 rounded-lg bg-slate-900/85 px-2.5 py-1 text-sm font-semibold text-white" data-testid="listing-hero-price">
          {formatListingPrice(l.price)}
        </span>
        ) : (
          <span className="absolute left-3 top-3 rounded-lg bg-slate-900/85 px-2.5 py-1 text-sm font-semibold text-white" data-testid="listing-hero-price-unknown">Price on request</span>
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

      <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl" style={{ fontFamily: "var(--font-display)" }} data-testid="listing-hero-title">
        {l.title}
      </h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {l.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {l.location}
          </span>
        )}
        {l.categories.map((c) => (
          <Chip key={c} tone="slate" size="sm">
            {c}
          </Chip>
        ))}
      </div>

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
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors hover:border-brand-accent/40"
            data-testid="listing-hero-shop"
            title={`Opens ${app.host} in a new tab`}
          >
            <img src={app.icon} alt="" className="h-3.5 w-3.5 rounded-sm" /> Open in {app.name} <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </a>
        ) : l.shopUrl && shopHost ? (
          <a
            href={l.shopUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-colors hover:border-brand-accent/40"
            data-testid="listing-hero-shop"
            title={`Opens ${shopHost} in a new tab`}
          >
            <Favicon host={shopHost} className="h-3.5 w-3.5" /> Visit shop <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
        Messaging opens your Nostr app. Payment happens with the seller, in their app.
      </p>

      {l.shipping.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3" data-testid="listing-hero-shipping">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Truck className="h-3.5 w-3.5" /> Shipping
          </p>
          <ul className="space-y-0.5 text-sm text-slate-700 dark:text-slate-200">
            {l.shipping.map((s, i) => (
              <li key={s.name + i} className="flex items-center justify-between gap-3">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{formatListingPrice({ amount: s.amount, currency: s.currency || l.price?.currency || "" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(l.description || l.summary) && (
        <ReadingText text={l.description || (l.summary as string)} className="mt-4" testId="listing-hero-description" />
      )}
    </div>
  );
}
