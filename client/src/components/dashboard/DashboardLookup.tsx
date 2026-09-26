import { Telescope } from "lucide-react";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";

/**
 * The dashboard's "Investigate" command bar — the research entry point. The same
 * search box as everywhere else (HeaderSearchBox): a suggested person opens their
 * profile, and a pasted npub, hex or NIP-05 resolves straight to it through the
 * home results page.
 */
export function DashboardLookup() {
  return (
    <div className="flex items-center gap-2" data-testid="dashboard-lookup">
      <Telescope className="hidden sm:block h-4 w-4 shrink-0 text-brand-primary" aria-hidden="true" />
      <HeaderSearchBox
        className="flex-1"
        placeholder="Look up anyone in your network…"
      />
    </div>
  );
}
