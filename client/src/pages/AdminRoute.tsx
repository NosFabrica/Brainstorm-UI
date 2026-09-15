import { Suspense } from "react";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { lazyWithReload } from "@/lib/lazyWithReload";

// Its own chunk: the console and its charts are ~800KB no visitor needs.
const AdminPage = lazyWithReload(() => import("@/pages/AdminPage"));

/** `/admin`: the operator console, only for a Session whose token claims admin. */
export function AdminRoute() {
  const user = useActiveAccountDisplay();
  if (!user?.isAdmin) return <Redirect to="/dashboard" replace />;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center" data-testid="admin-loading">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300 dark:text-slate-600" />
        </div>
      }
    >
      <AdminPage />
    </Suspense>
  );
}
