import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/services/api";
import { SHORT_LINK_ROUTE } from "@/lib/shortLink";
import NotFound from "@/pages/not-found";

/** Long enough that a normal resolve never flashes a spinner. */
const SPINNER_DELAY_MS = 400;

// Resolved the way the browser will: "//host", "/\\host" and "/\t/host" all leave the site.
function isOnSitePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  try {
    return new URL(path, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * `/s/:code` — resolve a short share link and replace it with the server's full link.
 *
 * The code is passed through untouched: the server owns its format, including
 * case folding and length.
 */
export default function ShortLinkPage() {
  const [, params] = useRoute(SHORT_LINK_ROUTE);
  const [, navigate] = useLocation();
  const code = params?.code ?? "";

  const { data, isError } = useQuery({
    queryKey: ["short-url", code],
    queryFn: () => apiClient.resolveShortUrl(code),
    enabled: !!code,
    retry: false,
    staleTime: Infinity,
  });

  const path = data?.path && isOnSitePath(data.path) ? data.path : "";

  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (path) navigate(path, { replace: true });
  }, [path, navigate]);

  // An unresolvable code or unusable path lands on the app's not-found page, not a blank one.
  if (isError || (data && !path)) return <NotFound />;

  if (!showSpinner) return null;

  return (
    <div
      data-testid="short-link-loading"
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Opening the link…</span>
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
