import { Telescope } from "lucide-react";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";

/**
 * The dashboard's "Investigate" command bar — the research entry point. Reuses the
 * shared typeahead (HeaderSearchBox), but routes to the deep-dive analytics
 * (`/profile/:npub`) instead of the public share page, and resolves a pasted
 * npub/hex straight there. Accepts name search, npub, hex, or NIP-05.
 */
export function DashboardLookup() {
  return (
    <div className="flex items-center gap-2" data-testid="dashboard-lookup">
      <Telescope className="hidden sm:block h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
      <HeaderSearchBox
        className="flex-1"
        placeholder="Look up anyone in your network…"
        profileHref={(npub) => `/p/${npub}`}
        resolveDirect
      />
    </div>
  );
}
