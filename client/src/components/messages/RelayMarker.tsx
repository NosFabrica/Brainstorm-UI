/**
 * One inbox relay's place in the history: a marker at the moment that relay
 * is complete to. Scrolling it into view is what loads that relay's next page
 * (lib/dm/pager) — Amethyst's per-relay sentinels, driven off visibility
 * rather than scroll position, so a reorder of the rows above never re-fires it.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { AlertTriangle, ArrowDown, Check, KeyRound, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RelayProgress } from "@/lib/dm/pager";
import { relayHost, shortDate } from "./people";

/** Whether `ref` is on screen. False where IntersectionObserver doesn't exist. */
export function useInView(ref: RefObject<Element>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

export function markerLabel(p: RelayProgress): string {
  switch (p.state) {
    case "loading":
      return p.requestedUntil ? `loading before ${shortDate(p.requestedUntil)}…` : "loading…";
    case "done":
      return "all history loaded";
    case "stalled":
      return "not responding";
    case "auth":
      return "asks you to sign in";
    default:
      return `complete to ${shortDate(p.completeTo)}`;
  }
}

const TONE: Record<RelayProgress["state"], string> = {
  idle: "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
  loading: "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
  done: "border-emerald-200 text-emerald-700 dark:border-emerald-500/25 dark:text-emerald-300",
  stalled: "border-amber-200 text-amber-700 dark:border-amber-500/25 dark:text-amber-300",
  auth: "border-amber-200 text-amber-700 dark:border-amber-500/25 dark:text-amber-300",
};

function MarkerIcon({ state }: { state: RelayProgress["state"] }) {
  const cls = "h-3 w-3 shrink-0";
  if (state === "loading") return <Loader2 className={cn(cls, "animate-spin")} />;
  if (state === "done") return <Check className={cls} />;
  if (state === "stalled") return <AlertTriangle className={cls} />;
  if (state === "auth") return <KeyRound className={cls} />;
  return <ArrowDown className={cls} />;
}

export interface RelayMarkerProps {
  progress: RelayProgress;
  /** "list" pages while in view; "chat" only reports visibility to its view. */
  variant: "list" | "chat";
  onAdvance?: (url: string) => void;
  onVisible?: (url: string, visible: boolean) => void;
  onRetry?: (url: string) => void;
  onSignIn?: () => void;
}

export function RelayMarker({ progress, variant, onAdvance, onVisible, onRetry, onSignIn }: RelayMarkerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const { url, state, reachedUntil } = progress;

  useEffect(() => {
    onVisible?.(url, inView);
  }, [url, inView, onVisible]);

  // In the list: keep paging while the marker stays in view. Re-armed every
  // time a page lands (the reached cursor moves), after a beat so the rows it
  // brought have a chance to push the marker off screen first.
  useEffect(() => {
    if (variant !== "list" || !inView || state !== "idle" || !onAdvance) return;
    const t = setTimeout(() => onAdvance(url), 250);
    return () => clearTimeout(t);
  }, [variant, inView, state, reachedUntil, url, onAdvance]);

  const action =
    state === "stalled" && onRetry ? (
      <button
        type="button"
        onClick={() => onRetry(url)}
        className="rounded-md border border-current px-2 py-0.5 font-sans text-[11px] font-semibold"
      >
        Retry
      </button>
    ) : state === "auth" && onSignIn ? (
      <button
        type="button"
        onClick={onSignIn}
        className="rounded-md border border-current px-2 py-0.5 font-sans text-[11px] font-semibold"
      >
        Sign in
      </button>
    ) : null;

  if (variant === "chat") {
    return (
      <div
        ref={ref}
        className={cn("flex items-center gap-2.5 font-mono text-[11px]", TONE[state].replace(/border-\S+/g, ""))}
        data-testid="dm-relay-marker"
        data-relay={url}
        data-state={state}
      >
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        <MarkerIcon state={state} />
        <span className="truncate">
          {relayHost(url)} · {markerLabel(progress)}
        </span>
        {action}
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn(
        "mx-1.5 my-0.5 flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5 font-mono text-[11px]",
        TONE[state],
      )}
      data-testid="dm-relay-marker"
      data-relay={url}
      data-state={state}
    >
      <MarkerIcon state={state} />
      <span className="min-w-0 flex-1 truncate">
        {relayHost(url)} · {markerLabel(progress)}
      </span>
      {action}
    </div>
  );
}
