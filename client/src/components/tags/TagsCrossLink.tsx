import { Link } from "wouter";
import { ChevronRight, Tag as TagIcon, type LucideIcon } from "lucide-react";

/**
 * The link between the two halves of Tags — browse ↔ yours.
 *
 * Replaces the `Everyone | Yours` pill switcher that used to sit under the
 * page header. The pill was a view toggle you only understood once you already
 * knew what it did; a labelled row says what you'd get, which is the thing
 * somebody who has never opened the catalogue actually needs.
 *
 * Kept reciprocal on purpose. Dropping the switcher without this would leave
 * `/tags` with no route to `/tags/mine` at all, and "anyone who lands on browse
 * discovers they have a page of their own" was the whole reason the two views
 * share a shell.
 *
 * Bottom of the page rather than the top: it's where you go NEXT, not what
 * this page is.
 */
export function TagsCrossLink({
  href,
  icon: Icon = TagIcon,
  title,
  description,
  testId,
}: {
  href: string;
  icon?: LucideIcon;
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-brand-primary/40 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/60"
      data-testid={testId}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10">
        <Icon className="h-4 w-4 text-brand-deep dark:text-brand-link" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-primary dark:text-slate-600" />
    </Link>
  );
}
