import { createContext, useContext } from "react";
import type { GroupKey } from "./networkGroups";

type SocialResult = Promise<{ success: boolean; error?: string }>;

/**
 * Stable, identity-constant card dependencies. The value is referentially
 * stable for the lifetime of NetworkPage, so consuming this context never
 * triggers a card re-render. `activeGroupRef` is a ref (not a reactive value)
 * so reading the active group in a click handler doesn't repaint every card.
 */
export interface NetworkCardActions {
  trustCacheRef: React.RefObject<Map<string, number | null>>;
  activeGroupRef: React.RefObject<string>;
  getPubkeyGroups: (pk: string) => GroupKey[];
  onToggleExpanded: (pk: string) => void;
  onCopyNpub: (npub: string, pk: string) => void;
  onCloseDetail: () => void;
  onNavigate: (path: string) => void;
  onFollow: (pk: string) => SocialResult;
  onUnfollow: (pk: string) => SocialResult;
  onMute: (pk: string) => SocialResult;
  onUnmute: (pk: string) => SocialResult;
  onPrefetchEnter?: (pk: string) => void;
  onPrefetchLeave?: (pk: string) => void;
}

/**
 * View state whose change *should* repaint every card: layout mode, the
 * global "any social action pending" flag (disables action buttons), and the
 * social-lists loading flag (drives group-badge filtering).
 */
export interface NetworkCardView {
  viewMode: "grid" | "list";
  socialPending: boolean;
  socialListsLoading: boolean;
}

const NetworkCardActionsContext = createContext<NetworkCardActions | null>(
  null,
);
const NetworkCardViewContext = createContext<NetworkCardView | null>(null);

export const NetworkCardActionsProvider = NetworkCardActionsContext.Provider;
export const NetworkCardViewProvider = NetworkCardViewContext.Provider;

export function useNetworkCardActions(): NetworkCardActions {
  const ctx = useContext(NetworkCardActionsContext);
  if (!ctx)
    throw new Error(
      "useNetworkCardActions must be used within a NetworkCardActionsProvider",
    );
  return ctx;
}

export function useNetworkCardView(): NetworkCardView {
  const ctx = useContext(NetworkCardViewContext);
  if (!ctx)
    throw new Error(
      "useNetworkCardView must be used within a NetworkCardViewProvider",
    );
  return ctx;
}
