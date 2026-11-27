import { CheckCircle2, XCircle, RefreshCw, Loader2 } from "lucide-react";
import { useState, useRef } from "react";

export function ConfirmRetriggerButton({
  pubkey,
  onConfirm,
  className = "",
  testId,
}: {
  pubkey: string;
  onConfirm: (pubkey: string) => Promise<void>;
  className?: string;
  testId?: string;
}) {
  const [state, setState] = useState<"idle" | "confirming" | "running" | "done" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === "running") return;
    if (state === "idle" || state === "done" || state === "error") {
      setState("confirming");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setState("idle"), 3000);
      return;
    }
    if (state === "confirming") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setState("running");
      try {
        await onConfirm(pubkey);
        setState("done");
        setTimeout(() => setState("idle"), 2000);
      } catch {
        setState("error");
        setTimeout(() => setState("idle"), 2500);
      }
    }
  };
  return (
    <button
      onClick={(e) => void handleClick(e)}
      disabled={state === "running"}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold transition-colors ${
        state === "confirming"
          ? "animate-pulse text-amber-700 dark:text-amber-300"
          : state === "done"
            ? "text-emerald-700 dark:text-emerald-300"
            : state === "error"
              ? "text-red-700 dark:text-red-300"
              : state === "running"
                ? "text-slate-400 dark:text-slate-500"
                : "text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-200"
      } ${className}`}
      data-testid={testId}
    >
      {state === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === "confirming" ? (
        <>
          <RefreshCw className="h-3 w-3" />
          <span>Confirm re-trigger?</span>
        </>
      ) : state === "done" ? (
        <>
          <CheckCircle2 className="h-3 w-3" />
          <span>Re-triggered</span>
        </>
      ) : state === "error" ? (
        <>
          <XCircle className="h-3 w-3" />
          <span>Failed</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3" />
          <span>Re-trigger</span>
        </>
      )}
    </button>
  );
}
