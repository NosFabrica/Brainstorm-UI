import type { ReactNode } from "react";
import { DivergenceTierGroup } from "./DivergenceBlock";
import { type OrderedSection } from "./divergenceSections";

/**
 * The divergence report's card — the server's "everything nobody has
 * settled": faults first, then the record.
 */
export function DivergenceReport({
  isError,
  sections,
  render: renderSection,
}: {
  isError: boolean;
  sections: OrderedSection[];
  render: (section: OrderedSection) => ReactNode;
}) {
  const faults = sections.filter((x) => x.tier === "fault");
  const record = sections.filter((x) => x.tier === "record");
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40"
      data-testid="card-billing-divergence"
    >
      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Needs attention</h4>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        What Flash and Brainstorm disagree on. Faults first, then what is worth knowing.
      </p>
      {isError ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-error">
          Couldn't load the divergence report.
        </p>
      ) : sections.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="billing-divergence-empty">
          Nothing unsettled — Flash and the scheduler agree.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          <DivergenceTierGroup tier="fault" sections={faults} render={renderSection} />
          <DivergenceTierGroup tier="record" sections={record} render={renderSection} />
        </div>
      )}
    </div>
  );
}
