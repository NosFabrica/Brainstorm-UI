import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, type SchedulingItem } from "@/services/api";
import { parsePubkeys } from "@/lib/schedulingPubkeys";
import { formatDuration } from "@/lib/schedulingDurations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const POLICIES_KEY = ["/api/admin/scheduling"];
const STATS_KEY = ["/api/admin/scheduling/stats"];
const USERS_KEY = ["/api/admin/users"];

export function BulkAssignPanel({ policies }: { policies: SchedulingItem[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [targetId, setTargetId] = useState(String(policies[0]?.id ?? ""));
  const [submitting, setSubmitting] = useState(false);

  const parsed = useMemo(() => parsePubkeys(text), [text]);

  async function handleAssign() {
    if (!parsed.valid.length || !targetId) return;
    setSubmitting(true);
    try {
      const { assigned } = await apiClient.assignPolicyUsers(
        Number(targetId),
        parsed.valid,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: POLICIES_KEY }),
        queryClient.invalidateQueries({ queryKey: STATS_KEY }),
        queryClient.invalidateQueries({ queryKey: USERS_KEY }),
      ]);
      setText("");
      toast({ title: `Assigned ${assigned} user${assigned === 1 ? "" : "s"}` });
    } catch (e) {
      toast({
        title: "Assignment failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor="bulk-target">Target policy</Label>
        <select
          id="bulk-target"
          className="ml-2 h-9 rounded-md border px-2 text-sm"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          {policies.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · every {formatDuration(p.schedule_interval_seconds)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="bulk-pubkeys">Pubkeys (hex or npub, one per line)</Label>
        <textarea
          id="bulk-pubkeys"
          className="mt-1 h-24 w-full rounded-md border p-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {parsed.valid.length} valid
        {parsed.invalidCount > 0 && ` · ${parsed.invalidCount} invalid`}
      </p>

      <Button
        size="sm"
        disabled={submitting || parsed.valid.length === 0}
        onClick={handleAssign}
      >
        Assign {parsed.valid.length} user{parsed.valid.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}
