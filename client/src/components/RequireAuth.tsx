import type { ComponentType } from "react";
import { Redirect, useLocation } from "wouter";
import { useActiveAccountDisplay } from "@/hooks/useActiveAccountDisplay";
import { retryNow, useServerStatus } from "@/lib/serverStatus";
import { SorryPage } from "@/components/sorry/SorryPage";
import { useCountdown } from "@/components/sorry/useCountdown";

/**
 * The guard on every page that needs the Brainstorm server. Signed out → a
 * clean redirect to the sign-in page, carrying ?next=<requested path> so the
 * reader returns after signing in. Signed in with the server down → the
 * sorry page where the page would have been; public search does not need
 * the server, so it is the way out offered (the dev, 2026-09-09). Public
 * pages (/, /p/:id, /faq, /about, …) render for everyone and never pass here.
 */
export function RequireAuth({ component: Component }: { component: ComponentType }) {
  const [location] = useLocation();
  // Identity is known synchronously on the first render — accounts bootstrap at
  // module load precisely so this guard never bounces a signed-in user.
  const signedIn = useActiveAccountDisplay();
  const status = useServerStatus();
  const nextTryInSec = useCountdown(status.nextProbeAt);
  if (!signedIn) {
    const next =
      location && location.startsWith("/") && location !== "/login"
        ? `?next=${encodeURIComponent(location)}`
        : "";
    // `replace`, not push: pushing leaves the gated URL in history, so pressing
    // Back returns to it, RequireAuth fires again and shoves you forward to
    // /login — a trap you can't reverse out of. Replacing means Back skips
    // straight past to wherever you actually came from.
    return <Redirect to={`/login${next}`} replace />;
  }
  if (status.api === "down") {
    return (
      <SorryPage scope="api" variant="page" onRetry={() => retryNow("api")} checking={status.checking} nextTryInSec={nextTryInSec} signedIn />
    );
  }
  return <Component />;
}
