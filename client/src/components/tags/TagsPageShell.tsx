import { Link } from "wouter";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { PageHeader } from "@/components/PageHeader";

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
 * The two views link to each other from the BOTTOM of the page, via
 * {@link TagsCrossLink}, rather than through a pill switcher under the header.
 * A toggle only reads as a toggle once you know what's on the other side; a
 * labelled row tells you. `/tags` shows its half only when signed in — pointing
 * a logged-out visitor at a sign-in wall isn't an introduction to anything.
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

        {children}
      </main>
    </div>
  );
}
