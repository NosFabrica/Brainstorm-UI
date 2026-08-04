import { ArrowRight } from "lucide-react";
import { SectionHeader } from "@/components/ui/section-header";
import { SupportedClientsGrid } from "@/components/SupportedClientsGrid";
import { SUPPORTED_CLIENT_NAMES } from "@/config/supportedClients";

/**
 * How the dashboard ends: education one click away, and the clients Brainstorm's
 * scores show up in. What used to be a full-bleed marketing band plus a ~420px
 * carousel here is now this — no billboard between the feed and the footer.
 *
 * ONE shelf, TWO densities — not two surfaces:
 *
 *  • `expanded` (scores still pending) — every module above is gated off, so the
 *    page is a greeting, a status line and a lookup box with a large empty gap
 *    below. The shelf expands into the room nobody else is using and the four
 *    client names become real tiles you can act on.
 *  • collapsed (scores in) — the modules fill that space, so this tightens back
 *    to a single quiet row.
 *
 * Same links, same place, same component in both, so there is no second copy of
 * anything to keep in sync and no card appearing and vanishing.
 *
 * Deliberately NOT framed as a task: Brainstorm can't detect which client
 * someone installed, so checkmarks or completion chrome would be a lie. It's a
 * shelf of outbound resources, and it reads as one.
 */
export function ClientShelf({
  expanded,
  onNavigate,
}: {
  expanded: boolean;
  onNavigate: (path: string) => void;
}) {
  return (
    <div
      className={`mb-8 text-xs ${
        expanded
          ? "flex flex-col gap-3"
          : // Stacks centered on mobile (no awkward left/right split), settles into
            // one spaced row on desktop. The client list is its own centered line
            // so it never collides with the two links.
            "flex flex-col items-center gap-3 border-t border-slate-200/70 dark:border-slate-800/60 pt-4 sm:flex-row sm:justify-between sm:gap-6"
      }`}
      data-testid="dashboard-footer-strip"
    >
      {expanded && (
        <>
          {/* The kicker labels the shelf so it reads as intentional rather than
              orphaned links, and stands in for the top border in this state.
              State-neutral copy on purpose: this also shows when a calculation
              has FAILED, where a "while you wait" framing would be wrong. */}
          <SectionHeader kicker="Supported clients" />
          <p className="text-slate-500 dark:text-slate-400">
            Your trust scores publish over NIP-85 — they show up in the Nostr apps you already read.
          </p>
          <SupportedClientsGrid testIdPrefix="dashboard-app" />
        </>
      )}

      {/* `contents` keeps this wrapper out of the layout entirely when collapsed,
          so the three children still lay out as direct flex items of the row —
          no duplicated button markup just to get the two links onto one line
          while expanded. */}
      <div className={expanded ? "flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5" : "contents"}>
        <button
          type="button"
          onClick={() => onNavigate("/what-is-wot")}
          className="inline-flex items-center gap-1.5 font-semibold text-brand-link hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid="button-learn-wot"
        >
          How trust works <ArrowRight className="h-3 w-3" />
        </button>
        {!expanded && (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center text-slate-400 dark:text-slate-500">
            <span>Works with</span>
            <span className="font-medium text-slate-500 dark:text-slate-400">{SUPPORTED_CLIENT_NAMES}</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => onNavigate("/nostr")}
          className="font-medium text-slate-400 dark:text-slate-500 hover:text-brand-deep dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 rounded"
          data-testid="link-supported-clients"
        >
          See all clients →
        </button>
      </div>
    </div>
  );
}
