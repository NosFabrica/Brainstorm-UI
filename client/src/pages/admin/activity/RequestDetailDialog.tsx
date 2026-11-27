import type { BrainstormRequestInstance } from "../types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { XCircle, FileText, Loader2 } from "lucide-react";
import { useState, useCallback } from "react";

/** A request's full record for the details dialog, its password left out. */
export function useRequestDetail() {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<Record<string, unknown> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<number | null>(null);

  const view = useCallback((item: BrainstormRequestInstance) => {
    setDetailRequestId(item.private_id);
    setDetailOpen(true);
    setDetailLoading(false);
    setDetailError(null);
    const sensitiveKeys = new Set(["password"]);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      if (!sensitiveKeys.has(key)) {
        data[key] = value;
      }
    }
    setDetailData(data);
  }, []);

  return {
    detailOpen,
    setDetailOpen,
    detailLoading,
    detailData,
    setDetailData,
    detailError,
    setDetailError,
    detailRequestId,
    view,
  };
}

/** The Activity log's "view the full request" dialog. */
export function RequestDetailDialog({ detail }: { detail: ReturnType<typeof useRequestDetail> }) {
  const {
    detailOpen,
    setDetailOpen,
    detailLoading,
    detailData,
    setDetailData,
    detailError,
    setDetailError,
    detailRequestId,
  } = detail;
  return (
    <Dialog
      open={detailOpen}
      onOpenChange={(open) => {
        setDetailOpen(open);
        if (!open) {
          setDetailData(null);
          setDetailError(null);
        }
      }}
    >
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-deep" />
            Brainstorm Request #{detailRequestId}
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm text-slate-600 dark:text-slate-300">
            Full request details for request #{detailRequestId}
          </DialogDescription>
        </DialogHeader>
        <div className="pt-2">
          {detailLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-deep" />
              <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Loading request detail...</span>
            </div>
          )}
          {detailError && (
            <div
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10"
              data-testid="detail-error"
            >
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700 dark:text-red-300">{detailError}</p>
            </div>
          )}
          {detailData && (
            <div className="space-y-2" data-testid="detail-fields">
              {Object.entries(detailData)
                .filter(([, value]) => value !== null && value !== undefined && value !== "")
                .map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between rounded-lg border border-slate-100 bg-white/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/60"
                  >
                    <span className="mr-4 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {key}
                    </span>
                    <span className="max-w-[60%] break-all text-right font-mono text-[10px] text-slate-800 dark:text-slate-200 sm:max-w-[350px]">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
