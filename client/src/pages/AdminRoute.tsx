import { Suspense } from "react";
import { Redirect } from "wouter";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { RouteFallback } from "@/components/RouteFallback";

// Its own chunk: the console and its charts are ~800KB no visitor needs.
const AdminPage = lazyWithReload(() => import("@/pages/AdminPage"));

/** `/admin`: the operator console, only for a Session whose token claims admin. */
export function AdminRoute() {
  const user = useActiveAccountDisplay();
  if (!user?.isAdmin) return <Redirect to="/dashboard" replace />;
  return (
    <Suspense fallback={<RouteFallback />}>
      <AdminPage />
    </Suspense>
  );
}
