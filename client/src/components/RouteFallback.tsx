import { Loader2 } from "lucide-react";

/** What a route shows while its code downloads. */
export function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" data-testid="route-loading">
      <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
    </div>
  );
}
