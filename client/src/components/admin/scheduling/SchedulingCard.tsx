import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  type CreateSchedulingBody,
  type SchedulingItem,
  type UpdateSchedulingBody,
} from "@/services/api";
import { formatDuration } from "@/lib/schedulingDurations";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PolicyFormDialog } from "./PolicyFormDialog";
import { PolicyUsersDialog } from "./PolicyUsersDialog";
import { BulkAssignPanel } from "./BulkAssignPanel";

const POLICIES_KEY = ["/api/admin/scheduling"];

type DialogState = { mode: "create" | "edit"; initial?: SchedulingItem };

export function SchedulingCard({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useQuery<SchedulingItem[]>({
    queryKey: POLICIES_KEY,
    queryFn: () => apiClient.getSchedulingPolicies(),
    enabled: active,
  });
  const policies = data ?? [];

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState<Record<number, boolean>>({});
  const [usersDialog, setUsersDialog] = useState<SchedulingItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SchedulingItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiClient.deleteSchedulingPolicy(confirmDelete.id);
      await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      setConfirmDelete(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  function clearPending(id: number) {
    setPendingEnabled((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  async function handleToggleEnabled(p: SchedulingItem) {
    const next = !(pendingEnabled[p.id] ?? p.enabled);
    setPendingEnabled((m) => ({ ...m, [p.id]: next }));
    try {
      await apiClient.updateSchedulingPolicy(p.id, { enabled: next });
      await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      clearPending(p.id);
    } catch (e) {
      clearPending(p.id); // revert to server truth
      toast({
        title: "Couldn't update policy",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  async function handleSubmit(body: CreateSchedulingBody | UpdateSchedulingBody) {
    const editing = dialog?.mode === "edit" && dialog.initial;
    setSubmitting(true);
    try {
      if (editing) {
        await apiClient.updateSchedulingPolicy(dialog!.initial!.id, body);
      } else {
        await apiClient.createSchedulingPolicy(body as CreateSchedulingBody);
      }
      await queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
      setDialog(null);
      toast({ title: editing ? "Policy updated" : "Policy created" });
    } catch (e) {
      toast({
        title: editing ? "Update failed" : "Create failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
          New policy
        </Button>
      </div>

      {isError ? (
        <div className="text-sm text-muted-foreground">
          <p>Failed to load scheduling policies.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 rounded border px-2 py-1 text-xs"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading scheduling policies…
        </p>
      ) : policies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scheduling policies.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-4">Name</th>
              <th className="py-1 pr-4">Priority</th>
              <th className="py-1 pr-4">Interval</th>
              <th className="py-1 pr-4">Manual quota</th>
              <th className="py-1 pr-4">Enabled</th>
              <th className="py-1 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td className="py-1 pr-4">
                  {p.name}
                  {p.is_default && (
                    <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs text-indigo-300">
                      Default
                    </span>
                  )}
                </td>
                <td className="py-1 pr-4 tabular-nums">{p.priority}</td>
                <td className="py-1 pr-4" title={`${p.schedule_interval_seconds}s`}>
                  {formatDuration(p.schedule_interval_seconds)}
                </td>
                <td
                  className="py-1 pr-4"
                  title={`${p.manual_quota_window_seconds}s window`}
                >
                  {p.manual_quota_limit} / {formatDuration(p.manual_quota_window_seconds)}
                </td>
                <td className="py-1 pr-4">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pendingEnabled[p.id] ?? p.enabled}
                    onClick={() => handleToggleEnabled(p)}
                    className="rounded border px-2 py-0.5 text-xs"
                  >
                    {(pendingEnabled[p.id] ?? p.enabled) ? "Enabled" : "Disabled"}
                  </button>
                </td>
                <td className="py-1 pr-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUsersDialog(p)}
                  >
                    Users
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    onClick={() => setDialog({ mode: "edit", initial: p })}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2"
                    disabled={p.is_default}
                    title={p.is_default ? "The default policy can't be deleted" : undefined}
                    onClick={() => {
                      setDeleteError(null);
                      setConfirmDelete(p);
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {policies.length > 0 && (
        <div className="border-t pt-3">
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Bulk-assign users to a policy
          </h4>
          <BulkAssignPanel policies={policies} />
        </div>
      )}

      {usersDialog && (
        <PolicyUsersDialog
          policy={usersDialog}
          open
          onOpenChange={(o) => !o && setUsersDialog(null)}
        />
      )}

      {dialog && (
        <PolicyFormDialog
          open
          mode={dialog.mode}
          initial={dialog.initial}
          submitting={submitting}
          onOpenChange={(o) => !o && setDialog(null)}
          onSubmit={handleSubmit}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete scheduling policy</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `Delete "${confirmDelete.name}"? This cannot be undone.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDelete}
            >
              Delete policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
