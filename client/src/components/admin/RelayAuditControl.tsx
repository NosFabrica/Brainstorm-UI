import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ACTIVITY_KEY = ["/api/admin/activity"];

/**
 * Admin action: compare what the TA relay holds for an observer with what we
 * recorded as published. Runs when the dialog opens (on demand, nothing stored)
 * and offers a relay resync when TAs are missing. Driven by the Users tab's
 * three-dot menu, like ResyncControl.
 */
export function RelayAuditControl({
  pubkey,
  open,
  onOpenChange,
}: {
  pubkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [resynced, setResynced] = useState(false);

  const audit = useQuery({
    queryKey: ["/api/admin/users", pubkey, "relay-audit"],
    queryFn: () => apiClient.relayAudit(pubkey),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const resync = useMutation({
    mutationFn: () => apiClient.resyncObserver(pubkey),
    onSuccess: async () => {
      setResynced(true);
      await queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY });
      toast({ title: "Relay resync queued", description: `${pubkey.slice(0, 12)}…` });
    },
    onError: (e: Error) => toast({ title: "Resync failed", description: e.message, variant: "destructive" }),
  });

  const data = audit.data;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setResynced(false);
        onOpenChange(o);
      }}
    >
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Relay audit</DialogTitle>
          <DialogDescription>
            Trusted Assertions on the relay vs. what we recorded as published for this observer.
          </DialogDescription>
        </DialogHeader>

        {audit.isFetching && (
          <p className="flex items-center gap-2 text-sm text-slate-500" data-testid="relay-audit-loading">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the relay…
          </p>
        )}

        {audit.isError && (
          <p className="text-sm text-red-500" data-testid="relay-audit-error">
            {(audit.error as Error).message}
          </p>
        )}

        {data && !audit.isFetching && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm" data-testid="relay-audit-result">
            <dt className="text-slate-500">Published</dt>
            <dd className="tabular-nums">{data.published.toLocaleString()}</dd>
            <dt className="text-slate-500">On relay</dt>
            <dd className="tabular-nums">{data.on_relay.toLocaleString()}</dd>
            <dt className="text-slate-500">Missing</dt>
            <dd className={`tabular-nums ${data.missing > 0 ? "font-medium text-red-600" : ""}`}>
              {data.missing.toLocaleString()}
            </dd>
            <dt className="text-slate-500">Orphans</dt>
            <dd className="tabular-nums">{data.orphans.toLocaleString()}</dd>
          </dl>
        )}

        {data && !audit.isFetching && !data.needs_resync && (
          <p className="text-sm text-emerald-600">Everything we published is on the relay.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {data?.needs_resync && !audit.isFetching && (
            <Button disabled={resync.isPending || resynced} onClick={() => resync.mutate()}>
              {resync.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              {resynced ? "Resync queued" : "Resync relay"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
