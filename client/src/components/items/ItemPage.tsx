/**
 * A Dictionary item's own page: its community concept's hand-made view (tier
 * three, ADR 0007) when it has one that applies, else the page every concept
 * gets from its definition (DListItemHero, tier two). The one place the two
 * meet. Tier two never asks for tier three, so a view taken out of the
 * registry (itemViews) leaves its items on the tier-two page.
 *
 * Both read the same cached view (useItemView): the tier-two page asking for
 * it again costs nothing.
 *
 * Each view's page is its own chunk (itemViews), so the first item of a
 * concept waits for it here, under the line tier two shows while it reads the
 * definition: the same spot and the same look, so nothing jumps.
 */
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DListItemHero } from "@/components/share/DListItemHero";
import type { ItemEvent } from "@/components/share/DListItemParts";
import { tierThreeFor } from "@/components/items/itemViews";
import { isReady, useItemView } from "@/hooks/useItemView";

export function ItemPage({ event }: { event: ItemEvent }) {
  const view = useItemView(event);
  if (isReady(view)) {
    const TierThree = tierThreeFor(event, view);
    if (TierThree)
      return (
        <Suspense fallback={<OpeningView />}>
          <TierThree event={event} view={view} />
        </Suspense>
      );
  }
  return <DListItemHero event={event} />;
}

function OpeningView() {
  return (
    <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400" data-testid="item-page-loading">
      <Loader2 className="h-4 w-4 animate-spin" /> Opening…
    </p>
  );
}
