import { useState } from "react";
import { getWindowConfig } from "./metrics";
import { ADMIN_RANGES, BACKEND_MAX_DAYS, customDays, type AdminRange } from "../adminRange";

/**
 * The dashboard's one time range: the presets, a custom "last N days" (up to
 * the backend's year), and a select on a phone. Shown only on the tabs the
 * range drives; mounted throughout, so a custom range being typed survives a
 * visit to another tab.
 */
export function RangeSelector({
  range,
  setRange,
  visible,
}: {
  range: AdminRange;
  setRange: (next: AdminRange) => void;
  visible: boolean;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(() => String(customDays(range) ?? 14));
  if (!visible) return null;
  return (
    <div className="flex basis-full items-center gap-2 sm:ml-auto sm:basis-auto">
      <div
        className="hidden gap-0.5 rounded-lg border-2 border-brand-accent/40 bg-white p-1 shadow-sm dark:bg-slate-900 sm:inline-flex"
        role="tablist"
        aria-label="Time range"
        data-testid="range-selector"
      >
        {ADMIN_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={range === r}
            onClick={() => setRange(r)}
            className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold transition-all active:scale-95 ${range === r ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
            data-testid={`button-range-${r}`}
          >
            {r === "all" ? "All" : r}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={customDays(range) !== null}
          onClick={() => setCustomOpen((o) => !o)}
          className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold transition-all active:scale-95 ${customDays(range) !== null ? "bg-brand-primary text-white shadow-md ring-1 ring-brand-primary/[0.4]" : "bg-slate-50 text-slate-600 hover:bg-brand-accent/10 hover:text-brand-deep hover:shadow-sm dark:bg-slate-900 dark:text-slate-300"}`}
          data-testid="button-range-custom"
        >
          {customDays(range) !== null ? `${customDays(range)}d` : "Custom"}
        </button>
      </div>
      <select
        value={customDays(range) !== null ? "custom" : range}
        onChange={(e) => (e.target.value === "custom" ? setCustomOpen(true) : setRange(e.target.value as AdminRange))}
        className="rounded-lg border border-brand-accent/30 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200 sm:hidden"
        aria-label="Time range"
        data-testid="select-range"
      >
        {ADMIN_RANGES.map((r) => (
          <option key={r} value={r}>
            {getWindowConfig(r).longLabel}
          </option>
        ))}
        <option value="custom">{customDays(range) !== null ? `Last ${customDays(range)} days` : "Custom…"}</option>
      </select>
      {(customOpen || customDays(range) !== null) && (
        <form
          className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400"
          data-testid="form-range-days"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.floor(Number(customDraft));
            if (n >= 1 && n <= BACKEND_MAX_DAYS) {
              setRange(`${n}d`);
              setCustomOpen(false);
            }
          }}
        >
          last
          <input
            type="number"
            min={1}
            max={BACKEND_MAX_DAYS}
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            className="w-14 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            aria-label="Days"
            data-testid="input-range-days"
          />
          days
          <button
            type="submit"
            className="rounded-md bg-brand-primary px-2 py-0.5 text-[11px] font-bold text-white"
            data-testid="button-range-days-apply"
          >
            Go
          </button>
        </form>
      )}
    </div>
  );
}
