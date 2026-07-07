import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  apiClient,
  type SchedulingItem,
  type SchedulingUsersPage,
} from "@/services/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

function shortPubkey(pk: string): string {
  return `${pk.slice(0, 12)}…${pk.slice(-6)}`;
}

export function PolicyUsersDialog({
  policy,
  open,
  onOpenChange,
}: {
  policy: SchedulingItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery<SchedulingUsersPage>({
    queryKey: ["/api/admin/scheduling", policy.id, "users", page, PAGE_SIZE],
    queryFn: () =>
      apiClient.getSchedulingPolicyUsers(policy.id, { page, size: PAGE_SIZE }),
    enabled: open,
    placeholderData: (prev) => prev,
  });

  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Users on “{policy.name}”</DialogTitle>
          <DialogDescription>
            {data ? `${data.total} assigned` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <p className="text-sm text-red-500">Failed to load users.</p>
        ) : isLoading && !data ? (
          <p className="text-sm text-muted-foreground" role="status">Loading users…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users assigned to this policy.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4">Pubkey</th>
                <th className="py-1 pr-4">Last published</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.pubkey}>
                  <td className="py-1 pr-4 font-mono" title={u.pubkey}>
                    {shortPubkey(u.pubkey)}
                  </td>
                  <td className="py-1 pr-4">
                    {u.last_time_published_graperank
                      ? new Date(u.last_time_published_graperank).toLocaleString()
                      : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between pt-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span>Page {page} of {pages}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
