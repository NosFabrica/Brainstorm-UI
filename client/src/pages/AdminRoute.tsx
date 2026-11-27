import { Suspense, useRef } from "react";
import { Redirect, useParams } from "wouter";
import { RequireAuth } from "@/components/RequireAuth";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { useHasSession } from "@/hooks/useHasSession";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { RouteFallback } from "@/components/RouteFallback";

// Its own chunk: the console and its charts are ~800KB no visitor needs.
const AdminPage = lazyWithReload(() => import("@/pages/AdminPage"));
const ProfilePage = lazyWithReload(() => import("@/pages/ProfilePage"));

/**
 * Whether the Active Account may see an admin-only page: `admin`, `not-admin`,
 * or `undecided`.
 *
 * The claim rides on the Account's Session, so "no Session" is undecided, not
 * "not an admin": a 401 makes `refreshSession` clear the Session for the length
 * of one round-trip, and that must not bounce an admin off the page they are on
 * (AdminPage's own guard reads it the same way). An identity that was an admin
 * here stays `admin` while its Session is being re-minted, so the page stays
 * mounted and keeps its state; one never seen as an admin waits instead.
 */
export type AdminGate = "admin" | "not-admin" | "undecided";

export function useAdminGate(): AdminGate {
  const user = useActiveAccountDisplay();
  const hasSession = useHasSession();
  // Per identity, so a switch to another Account never inherits the claim.
  const lastAdmin = useRef<string | null>(null);
  if (!user) return "not-admin";
  if (user.isAdmin) {
    lastAdmin.current = user.pubkey;
    return "admin";
  }
  if (hasSession) {
    lastAdmin.current = null;
    return "not-admin";
  }
  return lastAdmin.current === user.pubkey ? "admin" : "undecided";
}

/** `/admin`: the operator console, only for a Session whose token claims admin. */
export function AdminRoute() {
  const gate = useAdminGate();
  if (gate === "not-admin") return <Redirect to="/dashboard" replace />;
  if (gate === "undecided") return <RouteFallback />;
  return (
    <Suspense fallback={<RouteFallback />}>
      <AdminPage />
    </Suspense>
  );
}

/**
 * `/profile/:npub` — the old analytics view, now admin-only.
 *
 * `/p/:id` is the profile page. This one survives as operator telemetry
 * (audience quality, network position, GrapeRank parameters, reports in both
 * directions) that no normal user asked for, and it is deliberately NOT the
 * place a user lands when they click someone's name.
 *
 * ## Why the guard is here and not just on the links
 *
 * Eight call sites pointed at this route and four of them were user-facing;
 * the Deep dive on the dashboard's Network Alerts was the one that surfaced
 * it. Repointing links alone fixes today and nothing else — it can't catch a
 * bookmark, a shared URL, or the ninth link someone adds next month. A rule at
 * the route is one thing to keep true instead of an audit to repeat.
 *
 * The links were repointed as well, so a user never eats a redirect on the way
 * to a page they wanted; this is the backstop, not the mechanism.
 *
 * `replace` for the same reason RequireAuth uses it: pushing would leave the
 * deprecated URL in history, and Back would bounce you forward again.
 */
export function AdminProfileRoute() {
  const params = useParams<{ npub: string }>();
  // The Session's own admin claim, read the way /admin reads it: a Session being
  // re-minted after a 401 is undecided, not "not an admin". Anyone else — an
  // anonymous visitor included — goes to the public profile, not to /login.
  const gate = useAdminGate();
  if (gate === "not-admin") return <Redirect to={`/p/${params.npub}`} replace />;
  if (gate === "undecided") return <RouteFallback />;
  return (
    <Suspense fallback={<RouteFallback />}>
      <RequireAuth component={ProfilePage} />
    </Suspense>
  );
}
