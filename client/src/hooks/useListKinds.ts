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
  /**
   * The Top page's preview of what the words find; renders nothing when they find nothing. "See
   * all" opens the page. Offered two places, above People and below (`slot`): it renders in the
   * one above when the words ask for it — they name the kind (`named`), or its own reading of them
   * (Places: a town, a kind of place) — and in the one below otherwise.
   */
  Preview: ComponentType<{ query: string; slot: "lead" | "follow"; named: boolean; onSeeAll?: () => void }>;
  /**
   * Its card at the head of the side panel, for words that make it the thing the search is about
   * (Places: a town) — Google's panel. Renders nothing otherwise, and nothing on a phone, where
   * the panel folds to a strip and the Preview keeps the kind in the results.
   */
  Panel?: ComponentType<{ query: string; onSeeAll?: () => void }>;
  /**
   * A mark beside a person's name for their own thing this kind lists (GitHub: their account, by
   * lib/ownedAccount), linking to it; nothing until their handle is verified, or when they own none.
   * `inRow`: inside a dropdown row, which the keyboard moves through as one.
   */
  PersonMark?: ComponentType<{ pubkey: string; nip05?: string; website?: string; inRow?: boolean }>;
  /** Its own page under the tab strip: what the words find, or the list itself with no words. */
  Page: ComponentType<{ query: string }>;
  /** Reads its list ahead of a search, once the page is idle; draws nothing. */
  Warm: ComponentType;
  /**
   * Its row in the search dropdown, for the words being typed: a group they name (offered above
   * the people, `slot` "lead"), or the thing they name (below them, "follow"); or nothing.
   */
  Suggestion: ComponentType<{
    query: string;
    slot: "lead" | "follow";
    onPick?: () => void;
    /** The people the dropdown shows: an account one of them owns is theirs, not a row of its own. */
    people?: readonly { pubkey: string; nip05?: string; website?: string }[];
  }>;
}

export const ListKindsContext = createContext<readonly ListKindSearch[]>([]);

/** The kinds with a look of their own in search: none unless the app's root provides them. */
export function useListKinds(): readonly ListKindSearch[] {
  return useContext(ListKindsContext);
}
