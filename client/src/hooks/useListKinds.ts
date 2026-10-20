import { createContext, useContext, type ComponentType } from "react";

/**
 * A kind of list item that has a look of its own in search — Books, Places,
 * GitHub accounts (ADR 0007's tier three). Search (tier two) names no
 * concept: the kinds are handed down from the app's root
 * (components/items/TierThreeProvider), and search draws whatever it's given.
 */
export interface ListKindSearch {
  /** Stable key: "books", "places", "github". */
  key: string;
  /** What a group of them is called: "Books". */
  label: string;
  /** The community concept the kind is, so search can leave it to the kind's own look. */
  community: string;
  /** The More menu's group it sits in, with its neighbours: "Read & listen". */
  group: string;
  /** The Top page's preview of what the words find; renders nothing when they find nothing. "See all" opens the page. */
  Preview: ComponentType<{ query: string; onSeeAll?: () => void }>;
  /** Its own page under the tab strip: what the words find, or the list itself with no words. */
  Page: ComponentType<{ query: string }>;
}

export const ListKindsContext = createContext<readonly ListKindSearch[]>([]);

/** The kinds with a look of their own in search: none unless the app's root provides them. */
export function useListKinds(): readonly ListKindSearch[] {
  return useContext(ListKindsContext);
}
