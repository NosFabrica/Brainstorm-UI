/**
 * Settings › Trust › Advanced: a collapsed block holding the Service Provider
 * and Trust Calculation cards, where tags come from, and the technical view.
 */
import type { ReactNode } from "react";
import { ChevronDown, Settings as SettingsIcon } from "lucide-react";
import { TagRelaysCard } from "@/components/settings/TagRelaysCard";
import { TechnicalViewCard } from "@/components/settings/TechnicalViewCard";

export function AdvancedSection({
  advancedOpen,
  setAdvancedOpen,
  highlighted,
  serviceProviderCard,
  trustCalcCard,
}: {
  advancedOpen: boolean;
  setAdvancedOpen: (update: (open: boolean) => boolean) => void;
  /** The control a `?focus=` link is pulsing, if any. */
  highlighted: string | null;
  serviceProviderCard: ReactNode;
  trustCalcCard: ReactNode;
}) {
  return (
    <div className="space-y-4" data-testid="section-advanced">
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        aria-expanded={advancedOpen}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-accent/15 bg-white/70 px-5 py-4 text-left transition-all hover:border-brand-accent/30 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 dark:bg-slate-900/70"
        data-testid="button-advanced-toggle"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
            <SettingsIcon className="h-4 w-4 text-brand-deep" />
          </div>
          <div className="min-w-0">
            <h2
              className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100"
              style={{ fontFamily: "var(--font-display)" }}
              data-testid="text-advanced-title"
            >
              Advanced
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="text-advanced-subtitle">
              Service provider &amp; trust recalculation — most people never need these.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${advancedOpen ? "rotate-180" : ""}`}
        />
      </button>
      {advancedOpen && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="grid-advanced">
          {serviceProviderCard}
          {trustCalcCard}
          <div
            id="tag-relays-section"
            className={`scroll-mt-20 rounded-2xl transition-shadow ${highlighted === "tag-relays" ? "animate-attention-ring ring-2 ring-brand-accent/70" : ""}`}
          >
            <TagRelaysCard />
          </div>
          <TechnicalViewCard />
        </div>
      )}
    </div>
  );
}
