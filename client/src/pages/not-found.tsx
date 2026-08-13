import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PublicPageHeader } from "@/components/PublicPageHeader";

/**
 * The app's not-found page.
 *
 * Rewritten because it stopped being a developer's placeholder. Its copy used
 * to read "Did you forget to add the page to the router?" — a note to whoever
 * built the app, shown to whoever visited it.
 *
 * Tag pages now route here when the tag doesn't exist (issue #41 B3), which
 * makes this a page ordinary people reach by clicking a link someone sent them.
 * It deliberately says nothing about what they were looking for: the URL is
 * supplied by whoever wrote the link, and echoing it back is exactly what B3
 * was about. Two ways onward, no blame, no jargon.
 */
export default function NotFound() {
  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      <PublicPageHeader maxWidthClass="max-w-2xl" />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-16">
        <Card className="p-8">
          <EmptyState
            icon={Compass}
            title="This page isn't here"
            description="The link might be out of date, or have a typo in it."
          />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/tags"
              className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-slate-700 dark:text-slate-200"
              data-testid="notfound-browse-tags"
            >
              Browse tags
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover"
              data-testid="notfound-home"
            >
              Go home
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
