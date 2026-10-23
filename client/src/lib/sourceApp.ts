import type { MinimalEvent } from "@/lib/noteRefs";
import { naddrForEvent } from "@/lib/articleLinks";

/**
 * Which app published this event, and where does it open there.
 *
 * Provenance, not hand-off. `lib/openInApp` offers any Nostr client verified to
 * render a kind — a secondary escape hatch behind the ⋯ menu. This is the
 * narrower fact that a listing *lives* in Conduit, or a recipe on zap.cooking,
 * and the one place it should open: the seller's checkout, the recipe with its
 * timings and servings. Two apps today; each recognised by what its own
 * publisher stamps on the event, each opened at the page its own site resolves
 * (both probed on the relays and opened live, 2026-09-22).
 */
export interface SourceApp {
  /** As written in the button: "Buy on Conduit", "Open in Zap.cooking". */
  name: "Conduit" | "Zap.cooking";
  host: string;
  /** The item's page in that app, ready to open. */
  url: string;
  /** The app's real icon. Both are single-page apps that answer HTML for any
   *  path, `/favicon.ico` included, so the usual favicon guess shows a globe. */
  icon: string;
  /** What the app calls this kind of thing when the kind's generic word is
   *  wrong: a 30023 on zap.cooking is a "Recipe". Absent when "Article" is right. */
  noun?: string;
}

/**
 * Conduit hasn't named its referral parameter yet — one constant to swap when
 * it does. Everything Brainstorm sends Conduit carries it.
 */
export const CONDUIT_REFERRAL = "ref=brainstorm";

const CONDUIT_HOST = "shop.conduit.market";

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * Three ways a listing says it is Conduit's, any one enough: the Merchant
 * Portal signing its own work (`["client","Conduit Merchant Portal", …]`), the
 * marketplace's name as a `t` tag (the same provenance `lib/listing`'s APP_TAGS
 * strips from categories), or an older listing whose shop link already points
 * at conduit.market. All three open the same product page.
 */
function publishedInConduit(event: MinimalEvent): boolean {
  return event.tags.some((t) => {
    if (t[0] === "client") return /conduit/i.test(t[1] ?? "") || /:conduit-merchant$/i.test(t[2] ?? "");
    if (t[0] === "t") return (t[1] ?? "").trim().toLowerCase() === "conduit";
    if (t[0] === "r" || t[0] === "web") return /(^|\.)conduit\.market$/.test(hostOf(t[1] ?? ""));
    return false;
  });
}

/**
 * Zap.cooking stamps every recipe `["t","zapcooking"]` (older ones
 * `nostrcooking`) and filters by exactly those two words itself. The
 * `zapcooking-<slug>` tags beside them are its categories, not the signal.
 */
export const RECIPE_TAGS: readonly string[] = ["zapcooking", "nostrcooking"];
const recipeTagSet = new Set(RECIPE_TAGS);
/** zap.cooking's mark for its long-form pieces (newsletter, food stories), which wear the recipe tag too. */
const ARTICLE_TAG = "zapreads";
export function publishedOnZapCooking(event: MinimalEvent): boolean {
  const tags = event.tags.filter((t) => t[0] === "t").map((t) => (t[1] ?? "").trim().replace(/^#/, "").toLowerCase());
  return tags.some((t) => recipeTagSet.has(t)) && !tags.includes(ARTICLE_TAG);
}

/** An address with no identifier is not a page on anyone's site. */
const hasIdentifier = (event: MinimalEvent) => event.tags.some((t) => t[0] === "d" && !!t[1]);

function withReferral(url: string): string {
  const u = new URL(url);
  const [key, value] = CONDUIT_REFERRAL.split("=");
  u.searchParams.set(key, value);
  return u.toString();
}

const conduitApp = (url: string): SourceApp => ({
  name: "Conduit",
  host: CONDUIT_HOST,
  url: withReferral(url),
  icon: `https://${CONDUIT_HOST}/favicon.svg`,
});
const titleOf = (event: MinimalEvent) =>
  (event.tags.find((t) => t[0] === "title")?.[1] ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const conduitProduct = (event: MinimalEvent): SourceApp | null => {
  const naddr = naddrForEvent(event);
  return naddr ? conduitApp(`https://${CONDUIT_HOST}/products/${naddr}`) : null;
};

/** A product page the seller wrote into the listing (AGORA's T-shirt: Barattolo, swag.btc.pub as its page). */
const hasOwnPage = (event: MinimalEvent) =>
  event.tags.some((t) => (t[0] === "r" || t[0] === "web") && /^https?:\/\//i.test(t[1] ?? ""));

/**
 * The same product as the seller published it on Conduit, for a listing they
 * published elsewhere. Staci's shop (2026-09-24): 67 listing events from two
 * publishers — the Conduit Merchant Portal and another app — the other
 * app's being duplicates of products Conduit sells. The twin shares the
 * title, and carries the checkout the merchant set up there.
 */
function conduitTwin(event: MinimalEvent, sellerListings: MinimalEvent[]): SourceApp | null {
  const title = titleOf(event);
  if (!title) return null;
  const twin = sellerListings.find(
    (l) => l.kind === 30402 && l.pubkey === event.pubkey && publishedInConduit(l) && titleOf(l) === title,
  );
  return twin ? conduitProduct(twin) : null;
}

/**
 * The app this event was published in, and its page there — or null: most
 * events have none. With the seller's other listings in hand, a listing a
 * Conduit merchant published elsewhere still opens on Conduit.
 */
export function sourceAppFor(event: MinimalEvent, context: { sellerListings?: MinimalEvent[] } = {}): SourceApp | null {
  if (!hasIdentifier(event)) return null;
  if (event.kind === 30402 && publishedInConduit(event)) return conduitProduct(event);
  // The seller's Conduit twin never outranks a product page the seller wrote into the listing.
  if (event.kind === 30402 && !hasOwnPage(event) && context.sellerListings?.length) {
    const via = conduitTwin(event, context.sellerListings);
    if (via) return via;
  }
  if (event.kind === 30023 && publishedOnZapCooking(event)) {
    const naddr = naddrForEvent(event);
    if (!naddr) return null;
    return {
      name: "Zap.cooking",
      host: "zap.cooking",
      url: `https://zap.cooking/recipe/${naddr}`,
      icon: "https://zap.cooking/favicon.svg",
      noun: "Recipe",
    };
  }
  return null;
}

/**
 * Where a buyer goes for a listing: the app that published it, else — when
 * the seller wrote no product page of their own (the caller links that one as
 * "Visit <host>") — the listing on Conduit, which sells any NIP-99 listing by
 * its address: Orange Horizon's shoes, published elsewhere, open there with a
 * cart and an order sent over Nostr (2026-10-19). Never the seller's profile
 * website: a homepage, not this product, and anyone's to point anywhere.
 */
export function shopAppFor(event: MinimalEvent, context: { sellerListings?: MinimalEvent[] } = {}): SourceApp | null {
  const app = sourceAppFor(event, context);
  if (app || event.kind !== 30402 || !hasIdentifier(event) || hasOwnPage(event)) return app;
  return conduitProduct(event);
}
