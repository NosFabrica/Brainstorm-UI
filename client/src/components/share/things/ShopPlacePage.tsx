/**
 * A NIP-15 stall's or marketplace's page — a shop front. A stall shows where
 * it ships and what that costs, then its products (the kind-30018s its
 * merchant published into it), sold in the same priced cards as the Shop. A
 * marketplace shows its banner and the merchants it curates, then their stalls.
 */
import { Store, Truck } from "lucide-react";
import type { NostrEvent } from "nostr-tools";
import { ListingCard } from "@/components/search/cards";
import { ThingCard } from "@/components/search/thingCards";
import { ReadingText } from "@/components/share/ReadingText";
import { MediaImg } from "@/components/ui/media-img";
import { fetchFromSearch } from "@/services/search";
import { parseListing } from "@/lib/listing";
import type { Thing } from "@/lib/thing";
import type { Detail } from "./types";
import {
  InfoBox,
  Kicker,
  PageTitle,
  PeopleRoster,
  Section,
  SectionNote,
  useFetched,
  type PageEvent,
  SafeImg,
  useAuthors,
} from "./shared";
import { EmojiText } from "@/components/ui/custom-emoji";

type Json = Record<string, unknown>;

function jsonOf(content: string): Json | null {
  try {
    const v: unknown = JSON.parse(content);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** A stall's shipping zones as a buyer reads them: where, and what it costs. */
function zonesOf(json: Json | null): { name: string; regions: string[]; cost: number | null }[] {
  if (!Array.isArray(json?.shipping)) return [];
  return json.shipping.flatMap((z) => {
    const zone = z as Json | null;
    if (!zone) return [];
    const regions = Array.isArray(zone.regions) ? zone.regions.map(str).filter((r): r is string => !!r) : [];
    const name = str(zone.name) ?? str(zone.id) ?? regions[0];
    if (!name) return [];
    const cost = Number(zone.cost);
    return [{ name, regions, cost: Number.isFinite(cost) ? cost : null }];
  });
}

const money = (n: number, currency: string | null) =>
  n === 0
    ? "Free"
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)} ${currency ?? ""}`.trim();

export function ShopPlaceHero({ event, thing, detail }: { event: PageEvent; thing: Thing; detail: Detail<"shop"> }) {
  const json = jsonOf(event.content);
  const ui = json?.ui && typeof json.ui === "object" ? (json.ui as Json) : null;
  const banner = str(ui?.banner);
  const zones = detail.variant === "stall" ? zonesOf(json) : [];
  return (
    <div data-testid="thing-page-shop">
      {banner && /^https?:\/\//.test(banner) && (
        <div className="relative -mx-1 -mt-1 mb-4 aspect-[3/1] overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
          <MediaImg src={banner} preset="media_1280" alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )}
      <div className="flex items-start gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 dark:bg-slate-800 dark:ring-white/10">
          <SafeImg
            src={thing.image}
            className="h-full w-full object-cover"
            fallback={<Store className="h-7 w-7 text-slate-400 dark:text-slate-500" aria-hidden="true" />}
          />
        </span>
        <div className="min-w-0 flex-1">
          <Kicker icon={Store}>{detail.variant === "stall" ? "Shop" : "Marketplace"}</Kicker>
          <PageTitle testId="thing-page-title">
            <EmojiText text={thing.title} tags={thing.emoji} />
          </PageTitle>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {detail.variant === "stall"
              ? detail.currency
                ? `Prices in ${detail.currency}`
                : "Prices set per product"
              : `${detail.merchants} ${detail.merchants === 1 ? "merchant" : "merchants"}`}
          </p>
        </div>
      </div>
      {thing.description && (
        <ReadingText text={thing.description} tags={thing.emoji} className="mt-4" testId="thing-page-description" />
      )}
      {zones.length > 0 && (
        <div className="mt-4">
          <InfoBox label="Shipping" icon={Truck} testId="thing-page-shipping">
            <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
              {zones.map((z, i) => (
                <li key={`${z.name}-${i}`} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium">{z.name}</span>
                    {z.regions.length > 0 && z.regions.join(", ") !== z.name && (
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {z.regions.join(", ")}
                      </span>
                    )}
                  </span>
                  {z.cost !== null && (
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {money(z.cost, detail.currency)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </InfoBox>
        </div>
      )}
    </div>
  );
}

export function ShopPlaceSections({ event, detail }: { event: PageEvent; detail: Detail<"shop"> }) {
  const json = jsonOf(event.content);
  const stallId = str(json?.id) ?? event.tags.find((t) => t[0] === "d")?.[1];
  // A stall's products are its merchant's 30018s that name the stall.
  const products = useFetched(detail.variant === "stall" ? `stall-products:${event.id}` : null, async () => {
    const evs = await fetchFromSearch([{ kinds: [30018], authors: [event.pubkey] }], { limit: 200 });
    return evs.filter((e) => str(jsonOf(e.content)?.stall_id) === stallId && parseListing(e) !== null);
  });
  const merchants =
    detail.variant === "marketplace" && Array.isArray(json?.merchants)
      ? [...new Set(json.merchants.filter((m): m is string => typeof m === "string" && /^[0-9a-f]{64}$/i.test(m)))]
      : [];
  const stalls = useFetched(merchants.length ? `market-stalls:${event.id}` : null, () =>
    fetchFromSearch([{ kinds: [30017], authors: merchants.slice(0, 100) }], { limit: 60 }),
  );
  const stallAuthors = useAuthors((stalls ?? []).map((s) => s.pubkey));
  if (detail.variant === "stall") {
    return (
      <Section title="Products" count={products?.length} testId="thing-page-products">
        {products === undefined ? (
          <SectionNote>Opening the shop…</SectionNote>
        ) : products.length === 0 ? (
          <SectionNote>This shop hasn&apos;t listed anything the search relay has seen.</SectionNote>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((p: NostrEvent) => (
              <ListingCard key={p.id} event={p} author={null} showAuthor={false} />
            ))}
          </div>
        )}
      </Section>
    );
  }
  return (
    <>
      {merchants.length > 0 && (
        <Section title="Merchants" count={merchants.length} testId="thing-page-merchants">
          <PeopleRoster pubkeys={merchants} />
        </Section>
      )}
      {stalls && stalls.length > 0 && (
        <Section title="Their shops" count={stalls.length} testId="thing-page-stalls">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stalls.map((s) => (
              <ThingCard key={s.id} event={s} author={stallAuthors.get(s.pubkey) ?? null} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
