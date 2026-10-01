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
    <HeaderBar maxWidthClass="max-w-7xl" search={search} fullBleed={app} testId="nav-app-header">
      {/* The nudge's words only once there is room for them beside the search box;
          narrower, it is the "Finish setup" chip alone. */}
      <FinishSetupBanner labelFrom={app ? "never" : "xl"} />
      {actions && <div className="mr-1 hidden items-center lg:flex">{actions}</div>}
      {user.isAdmin && <AdminBadge />}
      <MessagesNavButton />
      <AccountMenu user={user} onLogout={onLogout} active={active} />
    </HeaderBar>
  );
}
