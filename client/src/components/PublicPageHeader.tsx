import { type ReactNode } from "react";
import { HeaderBar } from "@/components/HeaderBar";
import { AccountMenu } from "@/components/AccountMenu";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { logout } from "@/accounts/login-flow";

/**
 * Shared header for the public / shared-link pages (/p and its sub-pages, /e, /t, /tags,
 * and the info pages signed out). The common bar (HeaderBar — B mark, search box,
 * frost-on-scroll) with the page's `actions` on the right and, when signed in, the account
 * menu (so the logged-in user gets the same avatar + waffle on every page).
 */
export function PublicPageHeader({
  actions,
  maxWidthClass = "max-w-4xl",
  search,
  back,
}: {
  actions?: ReactNode;
  maxWidthClass?: string;
  search?: boolean;
  back?: { label: string; onClick: () => void };
}) {
  const user = useActiveAccountDisplay();

  return (
    <HeaderBar maxWidthClass={maxWidthClass} search={search} back={back} testId="public-header">
      {actions}
      {user && <AccountMenu user={user} onLogout={() => logout()} />}
    </HeaderBar>
  );
}
