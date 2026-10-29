/**
 * Tier three's reading of its concepts' items among many (ADR 0007), handed
 * to tier two through the override it leaves open (useItemView
 * PresentationOverrideContext): a GitHub account's handle and avatar, a
 * book's cover, title and author, on every card, row and tile — and the
 * kinds with a look of their own in search (hooks/useListKinds). Mounted
 * once, at the app's root. Without it, every item reads as its header's
 * hints say, and search has no kinds.
 */
import type { ReactNode } from "react";
import { PresentationOverrideContext } from "@/hooks/useItemView";
import { ListKindsContext } from "@/hooks/useListKinds";
import { tierThreePresentation } from "@/components/items/itemViews";
import { LIST_KINDS } from "@/components/items/ListKindSearch";

export function TierThreeProvider({ children }: { children: ReactNode }) {
  return (
    <PresentationOverrideContext.Provider value={tierThreePresentation}>
      <ListKindsContext.Provider value={LIST_KINDS}>{children}</ListKindsContext.Provider>
    </PresentationOverrideContext.Provider>
  );
}
