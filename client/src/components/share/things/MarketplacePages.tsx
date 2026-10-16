/**
 * The Open Markets kinds around a listing, on their own pages: a product
 * review (31555) with the product it reviews, a seller's product collection
 * (30405) with its products, and a shipping option (30406) with its facts.
 * What they name — the product, the products, the shipping options — is read
 * from the store (ADR 0005), and products are drawn with the Shop's own cards,
 * sold and priceless ones left out as everywhere else. A collection is how an
 * unlisted (`visibility: hidden`) product is reached, so those show on its page.
 */
import { useMemo } from "react";
import { Layers, MapPin, Package, Star, Truck } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { ListingCard } from "@/components/search/cards";
import { Stars, ThumbChip } from "@/components/search/thingCards";
import { ListingShipping } from "@/components/share/ListingShipping";
import { ReadingText } from "@/components/share/ReadingText";
import { EmojiText } from "@/components/ui/custom-emoji";
import { useAddressedEvents } from "@/hooks/useAddressedEvents";
import { useStoreEvents } from "@/hooks/useStoreEvents";
import { formatListingPrice, parseListing } from "@/lib/listing";
import { cardGroupOf, productsFromEvents } from "@/lib/listingVariants";
import { durationLabel, parseCollection, serviceLabel } from "@/lib/marketplace";
import type { Thing } from "@/lib/thing";
import { fetchCollectionProducts } from "@/services/nostr";
import type { Detail } from "./types";
import {
  FactRows,
  InfoBox,
  Kicker,
  PageTitle,
  SafeImg,
  Section,
  SectionNote,
  useAuthors,
  type PageEvent,
} from "./shared";

const dOf = (e: PageEvent) => e.tags.find((t) => t[0] === "d")?.[1] ?? "";

// ——— Product review (31555) ———

/** A product review's page: the product, the verdict (thumb and total), each category's score, and the words. */
export function ProductReviewHero({ thing, detail }: { thing: Thing; detail: Detail<"review"> }) {
  const address = detail.product?.address ?? "";
  const addresses = useMemo(() => (address ? [address] : []), [address]);
  const { get, settled } = useAddressedEvents(addresses);
  const product = address ? get(address) : undefined;
  const listing = product ? parseListing(product) : null;
  return (
    <div data-testid="thing-page-product-review">
      {product && listing ? (
        <div className="max-w-[16rem]" data-testid="thing-page-product">
          <ListingCard event={product} author={null} showAuthor={false} />
        </div>
      ) : (
        <div
          className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
          data-testid="thing-page-product"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            <Package className="h-6 w-6 text-slate-400" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Product
            </p>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {settled ? "The product isn't on the relays we asked." : "Looking for the product…"}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4">
        <Kicker icon={Star}>Product review</Kicker>
        <PageTitle testId="thing-page-title">{listing ? `Review of ${listing.title}` : thing.title}</PageTitle>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4" data-testid="thing-page-score">
        {detail.product && <ThumbChip thumb={detail.product.thumb} testId="thing-page-thumb" />}
        {thing.stars !== null && (
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
              {thing.stars.toFixed(1)}
            </span>
            <div>
              <Stars stars={thing.stars} size="md" testId="thing-page-stars" />
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">out of 5</p>
            </div>
          </div>
        )}
      </div>
      {detail.aspects.length > 0 && (
        <dl
          className="mt-4 grid max-w-sm grid-cols-[auto,1fr,auto] items-center gap-x-3 gap-y-1.5"
          data-testid="thing-page-aspects"
        >
          {detail.aspects.map((a, i) => (
            <div key={`${a.name}-${i}`} className="contents">
              <dt className="text-sm text-slate-600 dark:text-slate-300">{a.name}</dt>
              <dd className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(a.stars / 5) * 100}%` }} />
              </dd>
              <dd className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{a.stars.toFixed(1)}</dd>
            </div>
          ))}
        </dl>
      )}
      {thing.description && (
        <blockquote className="mt-4 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
          <ReadingText text={thing.description} tags={thing.emoji} testId="thing-page-description" />
        </blockquote>
      )}
    </div>
  );
}

// ——— Product collection (30405) ———

export function ProductCollectionHero({
  event,
  thing,
  detail,
}: {
  event: PageEvent;
  thing: Thing;
  detail: Detail<"productCollection">;
}) {
  const collection = parseCollection(event);
  // The collection's own options, priced as they are: no product, so no extra
  // cost — a collection's extra is added per product, in the product's money.
  const shipping = {
    shipping: [],
    shippingRefs: (collection?.shippingRefs ?? []).map((r) => ({ ...r, extra: null })),
    price: null,
  };
  const description =
    collection?.description && collection.description !== thing.description ? collection.description : null;
  return (
    <div data-testid="thing-page-collection">
      <div className="flex items-start gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
          <SafeImg
            src={thing.image}
            className="h-full w-full object-cover"
            fallback={<Layers className="h-7 w-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={Layers}>Collection</Kicker>
          <PageTitle testId="thing-page-title">
            <EmojiText text={thing.title} tags={thing.emoji} />
          </PageTitle>
          {detail.location && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> {detail.location}
            </p>
          )}
        </div>
      </div>
      {thing.description && (
        <p className="mt-4 text-sm font-medium text-slate-700 dark:text-slate-200" data-testid="thing-page-summary">
          <EmojiText text={thing.description} tags={thing.emoji} />
        </p>
      )}
      {description && (
        <ReadingText text={description} tags={thing.emoji} className="mt-3" testId="thing-page-description" />
      )}
      <ListingShipping listing={shipping} className="mt-4" />
    </div>
  );
}

/** How many named products a collection page looks up: an `a` list has no length limit. */
const NAMED_PRODUCTS = 200;

/** Whether a listing files itself under this collection with its own `a` tag. */
const filesUnder = (e: NostrEvent, collection: string) =>
  e.tags.some((t) => t[0] === "a" && (t[1] ?? "").toLowerCase() === collection.toLowerCase());

/**
 * A collection's products: the ones it names (`a` tags), and its seller's
 * listings that file themselves under it. Another seller's product shows only
 * when both sides say so — the collection names it AND it files itself under
 * the collection — the way an event market (Conduit's "Chicago V4V Summit")
 * gathers its vendors; a collection cannot claim a stranger's listing, and a
 * card from another seller says who sells it. One card per product, for sale.
 */
export function ProductCollectionSections({
  event,
  detail,
}: {
  event: PageEvent;
  detail: Detail<"productCollection">;
}) {
  const address = `${event.kind}:${event.pubkey}:${dOf(event)}`;
  const wanted = useMemo(() => detail.products.slice(0, NAMED_PRODUCTS), [detail.products]);
  const named = useAddressedEvents(wanted);
  const filters = useMemo(
    () => [{ kinds: [30402], authors: [event.pubkey], "#a": [address] }],
    [event.pubkey, address],
  );
  const filed = useStoreEvents(`collection-products:${address}`, filters, () =>
    fetchCollectionProducts(event.pubkey, address),
  );
  const products = useMemo(() => {
    const byId = new Map<string, NostrEvent>();
    for (const a of wanted) {
      const e = named.get(a);
      if (e && (e.pubkey === event.pubkey || filesUnder(e, address))) byId.set(e.id, e);
    }
    for (const e of filed.events) byId.set(e.id, e);
    return productsFromEvents([...byId.values()], { unlisted: true });
  }, [wanted, named, filed.events, event.pubkey, address]);
  const sellers = useAuthors(
    useMemo(
      () => [...new Set(products.map((p) => p.event.pubkey).filter((pk) => pk !== event.pubkey))],
      [products, event.pubkey],
    ),
  );
  const settled = named.settled && filed.settled;
  return (
    <Section title="Products" count={products.length} testId="thing-page-products">
      {products.length === 0 ? (
        <SectionNote>
          {settled ? "No product in this collection is for sale on the relays we asked." : "Opening the collection…"}
        </SectionNote>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map(({ event: e, group }) => (
            <ListingCard
              key={group.id}
              event={e}
              author={sellers.get(e.pubkey) ?? null}
              showAuthor={e.pubkey !== event.pubkey}
              group={cardGroupOf(group)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

// ——— Shipping option (30406) ———

export function ShippingOptionHero({ thing, detail }: { thing: Thing; detail: Detail<"shippingOption"> }) {
  const o = detail.option;
  return (
    <div data-testid="thing-page-shipping-option">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
          <Truck className="h-6 w-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={Truck}>Shipping option</Kicker>
          <PageTitle testId="thing-page-title">
            <EmojiText text={thing.title} tags={thing.emoji} />
          </PageTitle>
          <p
            className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100"
            data-testid="thing-page-price"
          >
            {o.price ? formatListingPrice(o.price) : "Priced by the seller"}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <InfoBox label="Delivery" icon={Package} testId="thing-page-shipping-facts">
          <FactRows
            rows={[
              ["Service", serviceLabel(o.service)],
              ["Carrier", o.carrier],
              ["Ships to", o.countries.join(", ")],
              ["Regions", o.regions.join(", ")],
              ["Takes", durationLabel(o.duration)],
              [o.service === "pickup" ? "Pick up at" : "From", o.location],
              ...o.limits,
            ]}
          />
        </InfoBox>
      </div>
      {thing.description && (
        <ReadingText text={thing.description} tags={thing.emoji} className="mt-4" testId="thing-page-description" />
      )}
    </div>
  );
}
