/**
 * The Connection page's line about the set of paths, and the controls: how
 * many paths were checked, how many are verified, unverified or flagged —
 * each count a button that narrows the page to that group — and a Next
 * button that steps through the group in order and says where you are.
 * A visitor who taps nothing sees the safest path and one button.
 */
import { ChevronRight, Loader2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { PathGroups, PathRisk } from "@/lib/hopsPaths";

export type PathGroupKey = Exclude<PathRisk, "checking">;

const GROUPS: { key: PathGroupKey; word: string; tone: "slate" | "warning" | "danger" }[] = [
  { key: "verified", word: "verified", tone: "slate" },
  { key: "unverified", word: "unverified", tone: "warning" },
  { key: "flagged", word: "flagged", tone: "danger" },
];

export function PathSummary({
  pathCount,
  pathCountCapped,
  checked,
  complete,
  checking,
  groups,
  selected,
  onSelect,
  position,
  total,
  onNext,
  busy,
}: {
  pathCount: number;
  pathCountCapped: boolean;
  checked: number;
  complete: boolean;
  /** Signals still landing — the counts are not yet worth saying. */
  checking: boolean;
  groups: PathGroups;
  selected: PathGroupKey | null;
  onSelect: (group: PathGroupKey | null) => void;
  /** 1-based, within the current list. */
  position: number;
  total: number;
  onNext: () => void;
  busy: boolean;
}) {
  const countWord = `${pathCount.toLocaleString()}${pathCountCapped ? "+" : ""}`;
  return (
    <div className="mt-5" data-testid="hops-summary">
      <p className="text-[15px] text-slate-600 dark:text-slate-300 leading-relaxed">
        {pathCount <= 1 ? (
          <>This is the only connection this direct:</>
        ) : checking ? (
          <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking who's on these paths…</span>
        ) : complete ? (
          <>All <span className="font-semibold text-slate-900 dark:text-slate-100">{countWord}</span> connections this direct:</>
        ) : (
          <>We checked <span className="font-semibold text-slate-900 dark:text-slate-100">{checked}</span> of the <span className="font-semibold text-slate-900 dark:text-slate-100">{countWord}</span> connections this direct:</>
        )}
      </p>
      {pathCount > 1 && !checking && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {GROUPS.filter((g) => groups[g.key].length > 0).map((g) => {
            const pressed = selected === g.key;
            return (
              <button
                key={g.key}
                type="button"
                aria-pressed={pressed}
                onClick={() => onSelect(pressed ? null : g.key)}
                className={`rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40 ${pressed ? "ring-2 ring-brand-accent/60" : ""}`}
                data-testid={`hops-group-${g.key}`}
                title={pressed ? "Show every path" : `Show only the ${g.word} paths`}
              >
                <Chip tone={g.tone} size="md">{groups[g.key].length} {g.word}</Chip>
              </button>
            );
          })}
        </div>
      )}
      {pathCount > 1 && !checking && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onNext}
            disabled={total <= 1}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 h-10 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            data-testid="hops-next"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Next path · {position} of {total}
          </button>
        </div>
      )}
    </div>
  );
}
