/**
 * A Dictionary item's own page: its community concept's hand-made view (tier
 * three, ADR 0007) when it has one that applies, else the page every concept
 * gets from its definition (DListItemHero, tier two). The one place the two
 * meet. Tier two never asks for tier three, so a view taken out of the
 * registry (itemViews) leaves its items on the tier-two page.
 *
 * Both read the same cached view (useItemView): the tier-two page asking for
 * it again costs nothing.
 */
import { DListItemHero } from "@/components/share/DListItemHero";
import type { ItemEvent } from "@/components/share/DListItemParts";
import { tierThreeFor } from "@/components/items/itemViews";
import { isReady, useItemView } from "@/hooks/useItemView";

export function ItemPage({ event }: { event: ItemEvent }) {
  const view = useItemView(event);
  if (isReady(view)) {
    const TierThree = tierThreeFor(event, view);
    if (TierThree) return <TierThree event={event} view={view} />;
  }
  return <DListItemHero event={event} />;
}
