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
import { useRelayAuthProblems } from "@/hooks/useRelayAuthProblems";
import { askRelayAuthAgain, relayAuthProblemFor, type RelayAuthProblem } from "@/services/relayAuth";

/**
 * Whether `ref` is on screen; `null` until the observer has said (and where
 * IntersectionObserver doesn't exist).
 */
export function useInView(ref: RefObject<Element>): boolean | null {
  const [visible, setVisible] = useState<boolean | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

/** Delivered, not opened yet: the relay isn't "loaded" until its messages can be read. */
const isOpening = (p: RelayProgress) => (p.opening ?? 0) > 0 && p.state !== "stalled" && p.state !== "auth";

export function markerLabel(p: RelayProgress): string {
  if (p.waiting && p.state === "idle") return "catching up…";
  if (isOpening(p)) return `opening ${p.opening!.toLocaleString()} message${p.opening === 1 ? "" : "s"}…`;
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

/** A login that didn't happen, said as why (services/relayAuth). */
export function authProblemLabel(problem: RelayAuthProblem): string {
  if (problem.by === "signer") return "your signer rejected signing in";
  if (problem.by === "relay")
    return problem.message ? `refused your sign-in: ${problem.message}` : "refused your sign-in";
  return problem.message ? `sign-in didn't go through: ${problem.message}` : "sign-in didn't go through";
}

/** Another go: the signer's no needs a fresh approval; anything else, a fresh try. */
export function authAgainLabel(problem: RelayAuthProblem): string {
  return problem.by === "signer" ? "Rejected - Ask again" : "Try again";
}

/** Which of `urls` have a login that didn't happen: the signer's no apart from everything else. */
export function refusedAmong(
  problems: ReadonlyMap<string, RelayAuthProblem>,
  urls: Iterable<string>,
): { signer: string[]; other: { url: string; problem: RelayAuthProblem }[] } {
  const signer: string[] = [];
  const other: { url: string; problem: RelayAuthProblem }[] = [];
  for (const url of new Set(urls)) {
    const problem = relayAuthProblemFor(problems, url);
    if (problem?.by === "signer") signer.push(url);
    else if (problem) other.push({ url, problem });
  }
  return { signer, other };
}

const TONE: Record<RelayProgress["state"], string> = {
  idle: "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
  loading: "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400",
  done: "border-emerald-200 text-emerald-700 dark:border-emerald-500/25 dark:text-emerald-300",
  stalled: "border-amber-200 text-amber-700 dark:border-amber-500/25 dark:text-amber-300",
  auth: "border-amber-200 text-amber-700 dark:border-amber-500/25 dark:text-amber-300",
};

function MarkerIcon({ state, opening }: { state: RelayProgress["state"]; opening?: boolean }) {
  const cls = "h-3 w-3 shrink-0";
  if (state === "loading" || opening) return <Loader2 className={cn(cls, "animate-spin")} />;
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
  /** In the list: still pages as it comes into view, but shows nothing (ConversationList says it once). */
  quiet?: boolean;
}

export function RelayMarker({ progress, variant, onAdvance, onVisible, onRetry, quiet = false }: RelayMarkerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const { url, reachedUntil } = progress;
  const opening = isOpening(progress);
  // While its wraps are still being opened a relay reads as loading, whatever its pager says.
  const state: RelayProgress["state"] = opening ? "loading" : progress.state;
  const backlog = progress.opening ?? 0;
  const problems = useRelayAuthProblems();
  const problem = state === "auth" ? relayAuthProblemFor(problems, url) : undefined;
  const label = problem ? authProblemLabel(problem) : markerLabel(progress);

  useEffect(() => {
    if (inView !== null) onVisible?.(url, inView);
  }, [url, inView, onVisible]);

  // In the list: keep paging while the marker stays in view. Re-armed every
  // time a page lands (the reached cursor moves) and as its wraps open — the
  // engine holds the next page until the last one can be read — after a beat
  // so the rows it brought have a chance to push the marker off screen first.
  useEffect(() => {
    if (variant !== "list" || !inView || progress.state !== "idle" || !onAdvance) return;
    const t = setTimeout(() => onAdvance(url), 250);
    return () => clearTimeout(t);
  }, [variant, inView, progress.state, progress.waiting, reachedUntil, backlog, url, onAdvance]);

  const action =
    state === "stalled" && onRetry ? (
      <button
        type="button"
        onClick={() => onRetry(url)}
        className="rounded-md border border-current px-2 py-0.5 font-sans text-[11px] font-semibold"
      >
        Retry
      </button>
    ) : problem ? (
      <button
        type="button"
        onClick={() => askRelayAuthAgain(url)}
        className="shrink-0 rounded-md border border-current px-2 py-0.5 font-sans text-[11px] font-semibold"
        data-testid="dm-relay-auth-again"
      >
        {authAgainLabel(problem)}
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
        <MarkerIcon state={state} opening={opening} />
        <span className={problem ? "min-w-0 break-words" : "truncate"}>
          {relayHost(url)} · {label}
        </span>
        {action}
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (quiet)
    return (
      <div
        ref={ref}
        aria-hidden
        className="h-px shrink-0"
        data-testid="dm-relay-marker"
        data-relay={url}
        data-state={state}
      />
    );

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
      <MarkerIcon state={state} opening={opening} />
      {/* A login problem is read to be acted on: it wraps rather than losing its reason. */}
      <span className={cn("min-w-0 flex-1", problem ? "break-words" : "truncate")}>
        {relayHost(url)} · {label}
      </span>
      {action}
    </div>
  );
}
