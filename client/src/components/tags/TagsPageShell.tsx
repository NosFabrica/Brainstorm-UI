import { Link } from "wouter";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/services/nostr";

/**
 * The chrome shared by `/tags` (everyone's tags) and `/tags/mine` (yours).
 *
 * ## Why one shell and not two pages
 *
 * "Your tags" used to be a Settings tab, and that was the wrong shelf: nothing
 * on it is a setting. "About you" is your public reputation and "What you've
 * said" is a log of permanent, signed, public claims — a record, not
 * configuration. (The one genuine tags SETTING, which relays to read, stays in
 * Settings → Trust & search where it belongs.)
 *
 * Putting the two views behind one switcher rather than at two unrelated URLs
 * does something the split couldn't: somebody who lands on browse — including
 * from a shared link — sees that they have a page of their own. Discovery of
 * the personal half was otherwise limited to people who already opened the
 * account menu, which is to say people who already knew.
 *
 * "Yours" only appears when signed in. Showing it logged-out would advertise
 * the feature, but only by leading to a sign-in wall, and the way in for a new
 * visitor is a tag page they can actually read.
 */
export function TagsPageShell({
  view,
  title,
  subtitle,
  children,
}: {
  view: "browse" | "mine";
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const signedIn = !!getCurrentUser()?.pubkey;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F8FAFC] font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicPageHeader maxWidthClass="max-w-2xl" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8" data-testid={`tags-view-${view}`}>
        <PageHeader kicker="Tags" title={title} subtitle={subtitle} testId="tags-page-header" />

        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          <Link
            href="/how-tags-work"
            className="font-semibold text-brand-link hover:underline"
            data-testid="tags-guide-link"
          >
            How tags work →
          </Link>
        </p>

        {/* Only a switcher once there are two things to switch between. A lone
            "Everyone" pill would just be a label pretending to be a control. */}
        {signedIn && (
          <div className="mt-5 flex items-center gap-1" data-testid="tags-view-switch">
            <ViewTab href="/tags" label="Everyone" active={view === "browse"} testId="tags-tab-browse" />
            <ViewTab href="/tags/mine" label="Yours" active={view === "mine"} testId="tags-tab-mine" />
          </div>
        )}

        {children}
      </main>
    </div>
  );
}

function ViewTab({
  href,
  label,
  active,
  testId,
}: {
  href: string;
  label: string;
  active: boolean;
  testId: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : "text-slate-500 hover:text-brand-primary dark:text-slate-400"
      }`}
      data-testid={testId}
    >
      {label}
    </Link>
  );
}
