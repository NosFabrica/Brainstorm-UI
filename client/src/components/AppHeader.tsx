import { HeaderBar } from "@/components/HeaderBar";
import { AdminBadge } from "@/components/AdminBadge";
import { type AppKey } from "@/components/AppsLauncher";
import { AccountMenu } from "@/components/AccountMenu";
import { FinishSetupBanner } from "@/components/FinishSetupBanner";
import { MessagesNavButton } from "@/components/messages/MessagesNavButton";
import { type AccountDisplay } from "@/accounts/display";
import { type ReactNode } from "react";

interface AppHeaderProps {
  user: AccountDisplay;
  onLogout: () => void;
  active?: AppKey;
  /**
   * Optional page-level controls (e.g. a Why/How mode toggle) rendered inline in
   * the header's right cluster on desktop. Hidden on mobile.
   */
  actions?: ReactNode;
  /** False on a flow a search would abandon half-way — setup, activation. */
  search?: boolean;
  /**
   * "app" for a full-screen tool (Messages): the bar spans the window as the
   * frame of the panes under it, and the setup nudge shrinks to its chip.
   */
  layout?: "page" | "app";
  /** Retained for API compatibility — headers are now uniformly transparent. */
  variant?: "dark" | "light";
}

/**
 * Single shared top navigation used by every authenticated page — the common bar
 * (HeaderBar: B mark, the shared search box, frost-on-scroll, the phone's magnifier) with
 * the finish-setup nudge, apps launcher + account menu on the right. Primary destinations
 * (Search/Dashboard/Network) live inside the account menu.
 */
export function AppHeader({ user, onLogout, active, actions, search, layout = "page" }: AppHeaderProps) {
  const app = layout === "app";
  return (
    <HeaderBar search={search} fullBleed={app} testId="nav-app-header">
      {/* The "Finish setup" chip alone: its words beside it pushed the search box off the
          middle of the bar (HeaderBar). The full-screen app view has the room for a count. */}
      <FinishSetupBanner labelFrom={app ? "never" : "chip"} />
      {actions && <div className="mr-1 hidden items-center lg:flex">{actions}</div>}
      {user.isAdmin && <AdminBadge />}
      <MessagesNavButton />
      <AccountMenu user={user} onLogout={onLogout} active={active} />
    </HeaderBar>
  );
}
