/**
 * The switch for kind labels on every card (Settings › Advanced).
 *
 * By default the pill that says what a thing is — Spec, Article, Listing… —
 * earns its place only where kinds mix on one surface; on a tab where every
 * card is a listing it would say nothing forty times (Benjamin, 2026-09-24).
 * The team and technical readers turn this on for the full view, on this
 * device (lib/kindLabelsPref).
 */
import { useState } from "react";
import { Tags } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { kindLabelsEverywhere, setKindLabelsEverywhere } from "@/lib/kindLabelsPref";

export function KindLabelsCard() {
  const [on, setOn] = useState(() => kindLabelsEverywhere());
  const change = (next: boolean) => {
    setKindLabelsEverywhere(next);
    setOn(next);
  };
  return (
    <Card className="overflow-hidden" data-testid="card-kind-labels">
      <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <Tags className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }} data-testid="text-kind-labels-title">
            Kind labels
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Results say what they are — Spec, Article, Stream — where kinds mix. This shows the label on every card, on this device.
          </p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <label htmlFor="kind-labels-switch" className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Kind labels on every card
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">For the technical view: listings, apps, events and the rest get their kind too.</p>
        </div>
        <Switch id="kind-labels-switch" checked={on} onCheckedChange={change} aria-label="Kind labels on every card" data-testid="switch-kind-labels" />
      </div>
    </Card>
  );
}
