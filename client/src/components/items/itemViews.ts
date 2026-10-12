/**
 * Tier three of item rendering (ADR 0007): the community concepts that have a
 * page of their own, and which one an item gets. A view is keyed by the
 * community concept's coordinate (config/dictionary), the last link of the
 * resolved chain, so the reader's copy, their Assistant's and the house's all
 * open the same page. It receives the same view tier two draws from
 * (useItemView) and reads fields only through the governing definition; a
 * view that can't find what it needs there says so, and the item renders the
 * tier-two way.
 */
import type { ComponentType } from "react";
import { conceptViewOf, type ConceptViewKey } from "@/config/dictionary";
import type { ReadyItemView } from "@/hooks/useItemView";
import type { ItemEvent } from "@/components/share/DListItemParts";
import { GitHubAccountView, githubAccountOf } from "@/components/items/GitHubAccountView";

export interface ItemViewProps {
  event: ItemEvent;
  view: ReadyItemView;
}

interface TierThreeView {
  /** Whether the governing definition and this item give the view what it draws. */
  applies: (event: ItemEvent, view: ReadyItemView) => boolean;
  View: ComponentType<ItemViewProps>;
}

const VIEWS: Record<ConceptViewKey, TierThreeView> = {
  "github-account": {
    applies: (event, view) => githubAccountOf(event, view.resolved.governing) !== null,
    View: GitHubAccountView,
  },
};

/** The community concept an item's definition resolves to: the chain's far end. */
export function communityCoordinateOf(view: ReadyItemView): string | null {
  return view.resolved.community?.coordinate ?? view.resolved.chain[view.resolved.chain.length - 1] ?? null;
}

/** The page this item draws itself with, or null for the tier-two page. */
export function tierThreeFor(event: ItemEvent, view: ReadyItemView): ComponentType<ItemViewProps> | null {
  const key = conceptViewOf(communityCoordinateOf(view));
  if (!key) return null;
  const candidate = VIEWS[key];
  return candidate.applies(event, view) ? candidate.View : null;
}
