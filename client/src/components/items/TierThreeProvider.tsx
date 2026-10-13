/**
 * Tier three's reading of its concepts' items among many (ADR 0007), handed
 * to tier two through the override it leaves open (useItemView
 * PresentationOverrideContext): a GitHub account's handle and avatar, a
 * book's cover, title and author, on every card, row and tile. Mounted once,
 * at the app's root. Without it, every item reads as its header's hints say.
 */
import type { ReactNode } from "react";
import { PresentationOverrideContext } from "@/hooks/useItemView";
import { tierThreePresentation } from "@/components/items/itemViews";

export function TierThreeProvider({ children }: { children: ReactNode }) {
  return (
    <PresentationOverrideContext.Provider value={tierThreePresentation}>
      {children}
    </PresentationOverrideContext.Provider>
  );
}
