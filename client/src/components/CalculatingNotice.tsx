import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * The single way the app says "your trust scores are still being built".
 *
 * Before this, a brand-new account met three different treatments of one state: a
 * slim line on the dashboard, a greyed-out ghost panel where Your Network goes, and
 * a hardcoded-dark full-screen splash on /network (which also broke light mode).
 * Saying it once, the same way, is both less code and the thing that stops a first
 * run reading as broken.
 *
 * Two honest facts, deliberately: the estimate sets expectations, and the queue
 * position proves the job is moving rather than hung. Search is mentioned because
 * it genuinely works without scores — it's relay-backed — so the wait doesn't have
 * to be idle.
 */
export function CalculatingNotice({
  queueAhead,
  searchHint = false,
  standalone = false,
  children,
  className,
}: {
  queueAhead?: number | null;
  /** Add "you can search while it runs" — only where a search box isn't already visible. */
  searchHint?: boolean;
  /** Wrap in a Card. False when it sits inside one already. */
  standalone?: boolean;
  /** Optional actions rendered beneath the line. */
  children?: ReactNode;
  className?: string;
}) {
  const line = (
    <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400" data-testid="calculating-notice">
      <Loader2 className="mt-px h-3.5 w-3.5 shrink-0 animate-spin text-brand-link" />
      <span>
        Building your scores — usually{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-300">about 5 minutes</span>
        {typeof queueAhead === "number" && queueAhead > 0 && <> · {queueAhead} ahead of you</>}
        {searchHint && <> · you can search while it runs</>}
      </span>
    </div>
  );

  const body = children ? (
    <div className="flex flex-col gap-3">
      {line}
      {children}
    </div>
  ) : (
    line
  );

  if (!standalone) return body;
  return (
    <Card
      className={`rounded-xl border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className ?? "mb-6"}`}
      data-testid="card-calculating-notice"
    >
      {body}
    </Card>
  );
}
