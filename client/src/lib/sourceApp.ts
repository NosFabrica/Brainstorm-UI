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
  /** As written in the button: "Open in Conduit". */
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

/** The app this event was published in, and its page there — or null: most events have none. */
export function sourceAppFor(event: MinimalEvent): SourceApp | null {
  if (!hasIdentifier(event)) return null;
  if (event.kind === 30402 && publishedInConduit(event)) {
    const naddr = naddrForEvent(event);
    if (!naddr) return null;
    return {
      name: "Conduit",
      host: CONDUIT_HOST,
      url: withReferral(`https://${CONDUIT_HOST}/products/${naddr}`),
      icon: `https://${CONDUIT_HOST}/favicon.svg`,
    };
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
