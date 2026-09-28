import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/services/api";
import { profilePath } from "@/lib/shareId";
import { SHORT_LINK_ROUTE } from "@/lib/shortLink";
import NotFound from "@/pages/not-found";

/** Long enough that a normal resolve never flashes a spinner. */
const SPINNER_DELAY_MS = 400;

/**
 * `/s/:code` — resolve a short share link and continue to the profile.
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

  const path = data?.pubkey ? profilePath(data.pubkey, data.relays ?? []) : "";

  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (path) navigate(path, { replace: true });
  }, [path, navigate]);

  // An unresolvable code, and a pubkey that won't encode, both land on the
  // app's own not-found page rather than leaving the visitor on a blank one.
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
