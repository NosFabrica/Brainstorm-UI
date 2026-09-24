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
import { technicalViewOn, setTechnicalView } from "@/lib/technicalView";

export function TechnicalViewCard() {
  const [on, setOn] = useState(() => technicalViewOn());
  const change = (next: boolean) => {
    setTechnicalView(next);
    setOn(next);
  };
  return (
    <Card className="overflow-hidden" data-testid="card-technical-view">
      <div className="flex items-start gap-3 border-b border-border bg-slate-50 px-5 py-4 dark:bg-slate-900">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 dark:border-slate-800/60 dark:bg-slate-900 dark:ring-slate-800/60">
          <Tags className="h-4 w-4 text-brand-deep" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100" style={{ fontFamily: "var(--font-display)" }} data-testid="text-technical-view-title">
            Technical view
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            For power users: what each result is, which relay served it, and the query as it went out. Off, the app looks as it does for everyone.
          </p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <label htmlFor="technical-view-switch" className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Technical view
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Kind and number on every card, the relay an event came from, the query as sent, an event&rsquo;s ids on its page. On this device, while you are signed in.</p>
        </div>
        <Switch id="technical-view-switch" checked={on} onCheckedChange={change} aria-label="Technical view" data-testid="switch-technical-view" />
      </div>
    </Card>
  );
}
