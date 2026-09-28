import { sourceAppFor } from "@/lib/sourceApp";
import type { MinimalEvent } from "@/lib/noteRefs";

/**
 * One product, one card. Staci's shop (2026-09-24): the same soap published
 * by the Conduit Merchant Portal and again by another app, side by side on
 * the Shop page. The duplicate was the seller's tooling, not a fact a buyer
 * needs: the two collapse into the copy that has a product page — the app
 * that sold it, else the listing's own link — and that copy takes the
 * group's first place in relay order. Two sellers with one title are two
 * products; anything that is not a listing passes through.
 */
type EventLike = MinimalEvent & { kind: number };

const LISTING_KIND = 30402;

const keyOf = (e: EventLike): string | null => {
  if (e.kind !== LISTING_KIND) return null;
  const title = (e.tags.find((t) => t[0] === "title")?.[1] ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return title ? `${e.pubkey}|${title}` : null;
};

/** 2 = the app's product page, 1 = the seller's own link, 0 = no page. */
const pageRank = (e: EventLike): number => {
  if (sourceAppFor(e)) return 2;
  if (e.tags.some((t) => (t[0] === "r" || t[0] === "web") && /^https?:\/\//i.test(t[1] ?? ""))) return 1;
  return 0;
};

export function collapseDuplicateListings<H extends { event: EventLike }>(hits: H[]): H[] {
  const slot = new Map<string, number>();
  const out: H[] = [];
  for (const h of hits) {
    const key = keyOf(h.event);
    if (key === null) { out.push(h); continue; }
    const at = slot.get(key);
    if (at === undefined) { slot.set(key, out.length); out.push(h); continue; }
    if (pageRank(h.event) > pageRank(out[at].event)) out[at] = h;
  }
  return out;
}
