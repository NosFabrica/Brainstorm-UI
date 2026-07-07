import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const ACTIVITY_KEY = ["/api/admin/activity"];
const USERS_KEY = ["/api/admin/users"];

/**
 * Admin action: force a full re-assert (resync) of one observer's published
 * state on the relay and/or Vespa. Confirms first — it re-pushes the observer's
 * entire above-cutoff set, so it's heavier than a normal recompute trigger.
 */
export function ResyncControl({ pubkey }: { pubkey: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResync() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.resyncObserver(pubkey, target);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ACTIVITY_KEY }),
        queryClient.invalidateQueries({ queryKey: USERS_KEY }),
      ]);
      setOpen(false);
      toast({
        title: "Resync queued",
        description: `${pubkey.slice(0, 12)}… (${target})`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      toast({ title: "Resync failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-[10px] text-amber-600 hover:text-amber-800 no-default-hover-elevate no-default-active-elevate px-2 h-6"
        onClick={(e) => {
          e.stopPropagation();
          setError(null);
          setOpen(true);
        }}
      >
        <RefreshCw className="h-3 w-3 mr-1" /> Resync
      </Button>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Resync published state</DialogTitle>
            <DialogDescription>
              Forces a full re-assert of this observer's above-cutoff Trusted
              Assertions. Heavier than a normal recompute — use for drift repair.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <Label htmlFor="resync-target">Target</Label>
            <select
              id="resync-target"
              className="h-9 rounded-md border px-2 text-sm"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="both">Both (relay + Vespa)</option>
              <option value="relay">Relay only</option>
              <option value="vespa">Vespa only</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={handleResync}>
              {busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Confirm resync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
