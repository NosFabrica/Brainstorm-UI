import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  Loader2,
  Square,
  CheckSquare,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { useState, useRef } from "react";
import { ActivityStatusBadge, TriggerSourceBadge } from "../ActivityBadges";
import { CopyButton } from "../CopyButton";
import { FailureDetailCard } from "./FailureDetailCard";
import {
  isWarningItem,
  getActivityPipelineState,
  isItemFailed,
  getFailureStage,
  extractErrorMessage,
} from "../failures";
import { truncateError, formatLatencyMs } from "../format";
import { type BrainstormRequestInstance } from "../types";

const pipelineRowStyles = {
  active: {
    row: "bg-blue-50/50 dark:bg-blue-500/10 border-l-[3px] border-l-blue-500 border-b border-b-blue-100/60 dark:border-b-blue-500/20",
    hover: "hover:bg-blue-100/40 dark:hover:bg-blue-500/15",
    expanded: "bg-blue-50/30 dark:bg-blue-500/5",
    expandedBorder: "border-blue-200/40 dark:border-blue-500/25",
    label: "PROCESSING",
    labelClass: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/50 dark:border-blue-500/30",
    dot: "bg-blue-500",
    dotPulse: "bg-blue-400",
  },
  waiting: {
    row: "bg-amber-50/40 dark:bg-amber-500/10 border-l-[3px] border-l-amber-400 border-b border-b-amber-100/50 dark:border-b-amber-500/20",
    hover: "hover:bg-amber-100/30 dark:hover:bg-amber-500/15",
    expanded: "bg-amber-50/20 dark:bg-amber-500/5",
    expandedBorder: "border-amber-200/40 dark:border-amber-500/25",
    label: "IN QUEUE",
    labelClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/50 dark:border-amber-500/30",
    dot: "bg-amber-500",
    dotPulse: "bg-amber-400",
  },
  failed: {
    row: "bg-red-50/30 dark:bg-red-500/10 border-l-[3px] border-l-red-300 border-b border-b-red-100/40 dark:border-b-red-500/20",
    hover: "hover:bg-red-50/50 dark:hover:bg-red-500/15",
    expanded: "bg-red-50/20 dark:bg-red-500/5",
    expandedBorder: "border-red-200/40 dark:border-red-500/25",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
  warning: {
    row: "bg-amber-50/30 dark:bg-amber-500/10 border-l-[3px] border-l-amber-300 border-b border-b-amber-100/40 dark:border-b-amber-500/20",
    hover: "hover:bg-amber-50/50 dark:hover:bg-amber-500/15",
    expanded: "bg-amber-50/20 dark:bg-amber-500/5",
    expandedBorder: "border-amber-200/40 dark:border-amber-500/25",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
  complete: {
    row: "border-l-[3px] border-l-transparent border-b border-b-slate-100/60 dark:border-b-slate-800/60",
    hover: "hover:bg-brand-primary/10 dark:hover:bg-brand-primary/10",
    expanded: "bg-brand-primary/10 dark:bg-brand-primary/5",
    expandedBorder: "border-brand-primary/15 dark:border-brand-primary/25",
    label: "",
    labelClass: "",
    dot: "",
    dotPulse: "",
  },
};

export function ActivityRow({
  item,
  idx,
  onViewDetail,
  onNavigateToUser,
  onRetrigger,
  selected,
  onToggleSelect,
  bulkStatus,
  profile,
  queuePosition,
  schedulingName,
  triggering = false,
}: {
  item: BrainstormRequestInstance;
  idx: number;
  onViewDetail: (item: BrainstormRequestInstance) => void;
  onNavigateToUser?: (pubkey: string) => void;
  onRetrigger?: (pubkey: string) => Promise<void>;
  /** A run for this person is already in flight (from any control): no second request. */
  triggering?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  bulkStatus?: "queued" | "running" | "success" | "failed";
  profile?: { name?: string; picture?: string };
  queuePosition?: number | "active";
  schedulingName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [retriggerState, setRetriggerState] = useState<"idle" | "confirming" | "running" | "done" | "error">("idle");
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try {
      const date = new Date(d.endsWith("Z") ? d : d + "Z");
      if (isNaN(date.getTime())) return d;
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      );
    } catch {
      return d;
    }
  };
  const pipeline = getActivityPipelineState(item);
  const style = pipelineRowStyles[pipeline];
  const isInPipeline = pipeline === "active" || pipeline === "waiting";
  // A run already requested from another control blocks a re-trigger as one in the pipeline does.
  const retriggerBlocked = isInPipeline || triggering;
  const isFailed = isItemFailed(item);
  const isWarning = isWarningItem(item);
  const failureStage = getFailureStage(item);
  const baseRowBg =
    pipeline === "complete"
      ? idx % 2 === 0
        ? "bg-white/40 dark:bg-slate-900/40"
        : "bg-slate-50/30 dark:bg-slate-900/30"
      : "";

  const handleRetrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retriggerState === "running" || retriggerBlocked || !item.pubkey || !onRetrigger) return;
    if (retriggerState === "idle" || retriggerState === "done" || retriggerState === "error") {
      setRetriggerState("confirming");
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = setTimeout(() => setRetriggerState("idle"), 3000);
      return;
    }
    if (retriggerState === "confirming") {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
      setRetriggerState("running");
      try {
        await onRetrigger(item.pubkey);
        setRetriggerState("done");
        setTimeout(() => setRetriggerState("idle"), 2000);
      } catch {
        setRetriggerState("error");
        setTimeout(() => setRetriggerState("idle"), 2000);
      }
    }
  };

  const bulkOverlay =
    bulkStatus === "running"
      ? "ring-1 ring-amber-300 ring-inset"
      : bulkStatus === "queued"
        ? "ring-1 ring-slate-200 dark:ring-slate-800 ring-inset opacity-90"
        : bulkStatus === "success"
          ? "ring-1 ring-emerald-300 ring-inset"
          : bulkStatus === "failed"
            ? "ring-1 ring-red-300 ring-inset"
            : "";
  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${style.row} ${style.hover} ${baseRowBg} ${bulkOverlay}`}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`row-activity-${item.private_id ?? idx}`}
      >
        {onToggleSelect && (
          <td
            className="w-8 px-2 py-2"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
          >
            <button
              type="button"
              className="inline-flex items-center justify-center"
              disabled={!item.pubkey}
              title={!item.pubkey ? "No pubkey to re-trigger" : selected ? "Deselect" : "Select"}
              data-testid={`checkbox-activity-${item.private_id ?? idx}`}
            >
              {bulkStatus === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
              ) : bulkStatus === "success" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : bulkStatus === "failed" ? (
                <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              ) : selected ? (
                <CheckSquare className="h-3.5 w-3.5 text-brand-deep" />
              ) : (
                <Square
                  className={`h-3.5 w-3.5 ${item.pubkey ? "text-slate-400 dark:text-slate-500" : "text-slate-200"}`}
                />
              )}
            </button>
          </td>
        )}
        <td className="whitespace-nowrap px-2 py-2 text-[10px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            {isInPipeline && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-50 ${style.dotPulse}`}
                />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
              </span>
            )}
            {fmtDate(item.created_at)}
          </div>
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-[10px] text-slate-500 dark:text-slate-400">
          {fmtDate(item.updated_at)}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
          {formatLatencyMs(item.created_at, item.updated_at) ?? "—"}
        </td>
        <td className="px-2 py-2 text-[10px]">
          {item.pubkey ? (
            (() => {
              let npub: string;
              try {
                npub = nip19.npubEncode(item.pubkey);
              } catch {
                npub = item.pubkey;
              }
              const npubShort = `${npub.slice(0, 12)}...${npub.slice(-4)}`;
              const displayName = profile?.name;
              return (
                <div className="flex min-w-0 items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateToUser?.(item.pubkey!);
                    }}
                    className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left transition-opacity hover:opacity-80"
                    data-testid={`link-user-${item.pubkey.slice(0, 8)}`}
                    title={displayName ? `${displayName} — ${npub}` : npub}
                  >
                    <Avatar className="h-5 w-5 shrink-0">
                      {profile?.picture ? (
                        <AvatarImage src={profile.picture} alt={displayName || "User"} className="object-cover" />
                      ) : null}
                      <AvatarFallback className="border border-slate-200 bg-slate-100 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-500">
                        {displayName?.charAt(0)?.toUpperCase() || (
                          <Users className="h-2.5 w-2.5 text-slate-300 dark:text-slate-600" />
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="max-w-[120px] truncate text-[10px] font-medium text-brand-deep hover:text-brand-accent">
                        {displayName || npubShort}
                      </span>
                      {displayName && (
                        <span className="hidden max-w-[120px] truncate font-mono text-[10px] text-slate-400 dark:text-slate-500 sm:inline">
                          {npubShort}
                        </span>
                      )}
                    </div>
                  </button>
                  <span className="hidden shrink-0 sm:inline-flex">
                    <CopyButton text={npub} />
                  </span>
                </div>
              );
            })()
          ) : (
            <span className="font-mono text-slate-400 dark:text-slate-500">—</span>
          )}
        </td>
        <td className="px-2 py-2">
          <TriggerSourceBadge value={item.trigger_source} />
          {schedulingName && (
            <div
              className="mt-0.5 text-[10px] font-medium text-brand-primary dark:text-brand-link"
              title="This user's current scheduling tier"
            >
              {schedulingName}
            </div>
          )}
        </td>
        <td className="px-2 py-2">
          <ActivityStatusBadge value={item.status} warning={isWarning} />
        </td>
        <td className="px-2 py-2">
          <ActivityStatusBadge value={item.ta_status} warning={isWarning} />
        </td>
        <td className="px-2 py-2">
          <ActivityStatusBadge value={item.internal_publication_status} warning={isWarning} />
        </td>
        <td className="px-2 py-2 font-mono text-[10px] text-slate-600 dark:text-slate-300">{item.algorithm || "—"}</td>
        <td className="px-2 py-2 text-center text-[10px]" data-testid={`cell-queue-${item.private_id ?? idx}`}>
          {(() => {
            // In-flight rows show their live position in the platform
            // queue (computed at the parent level): "active" for the row
            // currently being processed, 1..N for waiting rows in FIFO
            // order. Terminated rows fall back to the per-record value
            // the backend captured at run time, with 0 → "—".
            if (isInPipeline && queuePosition !== undefined) {
              if (queuePosition === "active") {
                return <span className="font-semibold text-emerald-600 dark:text-emerald-400">active</span>;
              }
              return (
                <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">{queuePosition}</span>
              );
            }
            const depth = item.how_many_others_with_priority;
            return <span className="text-slate-600 dark:text-slate-300">{depth > 0 ? depth : "—"}</span>;
          })()}
        </td>
        <td className="px-2 py-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-slate-400 dark:text-slate-500">{item.private_id}</span>
            {isInPipeline && style.label && (
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${style.labelClass}`}
              >
                {style.label}
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 text-center">
          {item.pubkey && onRetrigger && (
            <button
              onClick={handleRetrigger}
              disabled={retriggerState === "running" || retriggerBlocked}
              className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-all ${
                retriggerBlocked
                  ? "cursor-not-allowed text-slate-300 dark:text-slate-600"
                  : retriggerState === "confirming"
                    ? "animate-pulse border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                    : retriggerState === "done"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : retriggerState === "error"
                        ? "border border-red-200 bg-red-50 text-red-500 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-400"
                        : retriggerState === "running"
                          ? "text-slate-400 dark:text-slate-500"
                          : "border border-transparent text-brand-deep hover:border-brand-accent/20 hover:bg-brand-deep/5 hover:text-brand-accent"
              }`}
              title={
                retriggerBlocked
                  ? "Currently processing"
                  : retriggerState === "confirming"
                    ? "Click again to confirm"
                    : "Re-trigger GrapeRank"
              }
              data-testid={`button-retrigger-${item.private_id}`}
            >
              {retriggerState === "running" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : retriggerState === "confirming" ? (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span>Confirm?</span>
                </>
              ) : retriggerState === "done" ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Done</span>
                </>
              ) : retriggerState === "error" ? (
                <>
                  <XCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Failed</span>
                </>
              ) : retriggerBlocked ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin opacity-40" />
                  <span className="hidden sm:inline">Active</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  <span className="hidden sm:inline">Re-trigger</span>
                </>
              )}
            </button>
          )}
        </td>
      </tr>
      {isFailed && !expanded && (
        <tr
          className={`cursor-pointer ${style.row} ${style.hover}`}
          onClick={() => setExpanded(true)}
          data-testid={`row-activity-failure-preview-${item.private_id ?? idx}`}
        >
          <td colSpan={13} className="border-t border-red-100/50 px-4 py-1.5 dark:border-red-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-500" />
              <div className="min-w-0 flex-1">
                <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                  Failed at {failureStage ?? "Pipeline"}:
                </span>
                <span className="break-words font-mono text-[10px] text-red-800 dark:text-red-300">
                  {truncateError(extractErrorMessage(item), 160)}
                </span>
                <span className="ml-2 text-[10px] text-red-500/70">Click for details</span>
              </div>
            </div>
          </td>
        </tr>
      )}
      {isWarning && !expanded && (
        <tr
          className={`cursor-pointer ${style.row} ${style.hover}`}
          onClick={() => setExpanded(true)}
          data-testid={`row-activity-warning-preview-${item.private_id ?? idx}`}
        >
          <td colSpan={13} className="border-t border-amber-100/50 px-4 py-1.5 dark:border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <span className="break-words font-mono text-[10px] text-amber-800 dark:text-amber-300">
                {truncateError(item.error?.message?.trim() || item.error?.code || "", 160)}
              </span>
            </div>
          </td>
        </tr>
      )}
      {expanded && (
        <tr className={style.expanded}>
          <td colSpan={12} className="px-4 py-3">
            {isFailed ? (
              <FailureDetailCard
                item={item}
                onRetrigger={item.pubkey && onRetrigger ? handleRetrigger : undefined}
                retriggerState={retriggerState}
                isInPipeline={retriggerBlocked}
                onViewDetail={(e) => {
                  e.stopPropagation();
                  onViewDetail(item);
                }}
                onNavigateToUser={onNavigateToUser}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
                  {item.pubkey && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Full Pubkey
                      </span>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">
                        {item.pubkey}
                      </p>
                    </div>
                  )}
                  {item.error?.message && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Error</span>
                      <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">
                        {item.error.message}
                      </p>
                    </div>
                  )}
                  {item.count_values && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Count Values
                      </span>
                      <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">
                        {item.count_values}
                      </p>
                    </div>
                  )}
                  {item.parameters && (
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                        Parameters
                      </span>
                      <p className="mt-0.5 break-all font-mono text-slate-700 dark:text-slate-200">{item.parameters}</p>
                    </div>
                  )}
                </div>
                <div className={`mt-3 border-t pt-2 ${style.expandedBorder} flex flex-wrap items-center gap-3`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetail(item);
                    }}
                    className="flex min-h-[28px] items-center gap-1 text-[10px] font-semibold text-brand-deep transition-colors hover:text-brand-accent"
                    data-testid={`button-view-detail-${item.private_id}`}
                  >
                    <Eye className="h-3 w-3" />
                    View Full Request
                  </button>
                </div>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
