import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { NetworkReachStrip } from "@/components/network/NetworkReachStrip";
import { TrustScoreModal } from "@/components/score/TrustScorePov";
import { countValuesOf } from "@/lib/networkReach";
import type { networkPerspective } from "@/lib/networkPerspective";
import { presetDisplayLabel, type TrustPreset } from "@/services/trustThreshold";

/** The title, whose scores these are (changed in the account menu, not here), and what they add up to. */
export function NetworkHeader({
  perspective,
  trustPreset,
  countValues,
  grapeRankLoading,
}: {
  perspective: ReturnType<typeof networkPerspective>;
  trustPreset: TrustPreset | null;
  countValues: unknown;
  grapeRankLoading: boolean;
}) {
  const [scoreExplainOpen, setScoreExplainOpen] = useState(false);
  return (
    <div className="relative z-10 mb-8 pt-2 text-left" data-testid="section-network-header">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[100%] w-[100%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary/5 blur-[60px] will-change-transform" />
      <PageHeader
        kicker="Who you trust"
        title={
          <>
            Your <span className="text-brand-link">Network</span>
          </>
        }
        subtitle="Browse and manage your social graph connections."
        testId="section-network-header"
      />
      {/* Whose scores these are, said once where every row's ring and coin follow it. */}
      <div
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600 dark:text-slate-300"
        data-testid="network-perspective"
      >
        <span>
          {perspective.label}
          {trustPreset && (
            <span className="text-slate-400 dark:text-slate-500"> · {presetDisplayLabel(trustPreset)} preset</span>
          )}
        </span>
        {/* No switch here: the perspective is changed in the account menu, on every
                  page. This line only says which one these scores are from. */}
        <button
          type="button"
          onClick={() => setScoreExplainOpen(true)}
          className="text-xs font-medium text-brand-link hover:underline"
          data-testid="network-perspective-explain"
        >
          What is this?
        </button>
      </div>
      {/* What those scores add up to — reach and health, from the run this page
                already loads. The dashboard's "Your Network" card, now a line under
                the title it belongs to, not a second control panel. */}
      <div className="mt-3">
        <NetworkReachStrip
          counts={countValuesOf(countValues)}
          loading={grapeRankLoading}
          onDetails={() => setScoreExplainOpen(true)}
        />
      </div>
      <TrustScoreModal open={scoreExplainOpen} onOpenChange={setScoreExplainOpen} />
    </div>
  );
}
