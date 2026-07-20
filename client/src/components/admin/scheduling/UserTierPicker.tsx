import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, type SchedulingItem } from "@/services/api";
import { useToast } from "@/hooks/use-toast";

const POLICIES_KEY = ["/api/admin/scheduling"];
const USERS_KEY = ["/api/admin/users"];

/**
 * Inline tier picker for a single user in the admin Users table. `schedulingId`
 * null means the user is on the default policy — we preselect that policy so the
 * dropdown always reflects the effective tier.
 */
export function UserTierPicker({
  pubkey,
  schedulingId,
  policies,
  onChanged,
}: {
  pubkey: string;
  schedulingId: number | null;
  schedulingName: string;
  policies: SchedulingItem[];
  /** Fired after a successful reassignment — lets callers refresh their own
   *  lists (e.g. the per-policy assigned-users list). Optional; the Users tab
   *  doesn't need it. */
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [override, setOverride] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const defaultId = policies.find((p) => p.is_default)?.id;
  const value = override ?? schedulingId ?? defaultId;

  async function handleChange(nextId: number) {
    setOverride(nextId);
    setBusy(true);
    try {
      await apiClient.assignUserScheduling(pubkey, nextId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: USERS_KEY }),
        queryClient.invalidateQueries({ queryKey: POLICIES_KEY }),
      ]);
      onChanged?.();
      setOverride(null);
      toast({ title: "Tier updated", description: `${pubkey.slice(0, 12)}…` });
    } catch (e) {
      setOverride(null); // revert to server truth
      toast({
        title: "Assignment failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <select
        aria-label="Scheduling tier"
        className="h-8 rounded border px-1 text-xs"
        value={value != null ? String(value) : ""}
        disabled={busy}
        onChange={(e) => handleChange(Number(e.target.value))}
      >
        {policies.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
    </span>
  );
}
