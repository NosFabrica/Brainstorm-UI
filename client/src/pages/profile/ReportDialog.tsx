import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { useSocialActions } from "@/hooks/useSocialActions";
import { asyncHandler } from "@/lib/asyncHandler";

/** Publishes a kind-1984 report for `hexPubkey` with the reason picked. */
export function ReportDialog({
  reportDialogOpen,
  setReportDialogOpen,
  social,
  hexPubkey,
}: {
  reportDialogOpen: boolean;
  setReportDialogOpen: (open: boolean) => void;
  social: ReturnType<typeof useSocialActions>;
  hexPubkey: string;
}) {
  const { toast } = useToast();
  const [reportReason, setReportReason] = useState("spam");
  return (
    <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
      <DialogContent className="rounded-2xl border-slate-200/80 shadow-xl dark:border-slate-800/80 sm:max-w-md">
        <DialogHeader>
          <DialogTitle
            className="text-base font-bold text-slate-900 dark:text-slate-100"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Report User
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            This will publish a kind 1984 report event to Nostr relays. Choose a reason below.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-3">
          {[
            { value: "spam", label: "Spam", desc: "Unsolicited or repetitive content" },
            { value: "impersonation", label: "Impersonation", desc: "Pretending to be someone else" },
            { value: "nudity", label: "Inappropriate Content", desc: "Offensive or explicit material" },
            { value: "other", label: "Other", desc: "Another reason not listed above" },
          ].map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all duration-200 ${
                reportReason === opt.value
                  ? "border-brand-primary/25 bg-brand-primary/10 shadow-sm dark:border-brand-primary/[0.3] dark:bg-brand-primary/10 dark:shadow-none"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-900/50"
              }`}
              data-testid={`report-option-${opt.value}`}
            >
              <input
                type="radio"
                name="report-reason"
                value={opt.value}
                checked={reportReason === opt.value}
                onChange={() => setReportReason(opt.value)}
                className="mt-0.5 accent-brand-link"
              />
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{opt.label}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <button
            type="button"
            onClick={() => setReportDialogOpen(false)}
            className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 sm:flex-none"
            data-testid="button-report-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={social.isPending("report", hexPubkey) || social.isAnyPending}
            onClick={asyncHandler(async () => {
              const result = await social.report(hexPubkey, reportReason);
              if (result.cancelled) return;
              if (result.success) {
                toast({ title: "Reported", description: "Report published to Nostr relays" });
                setReportDialogOpen(false);
              } else {
                toast({ title: "Error", description: result.error || "Failed to report", variant: "destructive" });
              }
            })}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50 sm:flex-none"
            data-testid="button-report-confirm"
          >
            {social.isPending("report", hexPubkey) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Flag className="h-3.5 w-3.5" />
            )}
            Submit Report
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
