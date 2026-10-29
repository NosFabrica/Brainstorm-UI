import { Loader2 } from "lucide-react";
import { PublicPageHeader } from "@/components/PublicPageHeader";

/**
 * What a route shows while its code downloads: the header every page shares
 * (the same bar, and the account menu when signed in), with a spinner under
 * it — so the screen keeps its frame instead of blanking and the header
 * popping back in once the page arrives.
 */
export function RouteFallback() {
  return (
    <>
      <PublicPageHeader />
      <div className="flex min-h-[50vh] items-center justify-center" data-testid="route-loading">
        <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
      </div>
    </>
  );
}
