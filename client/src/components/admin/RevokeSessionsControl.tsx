import { apiClient } from "@/services/api";
import { BusyConfirmDialog } from "@/components/BusyConfirmDialog";
import { useToast } from "@/hooks/use-toast";

/** Admin action: sign one user out everywhere. Confirms first; driven from the Users tab's menu. */
export function RevokeSessionsControl({
  pubkey,
  open,
  onOpenChange,
}: {
  pubkey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  async function revoke() {
    await apiClient.revokeUserSessions(pubkey);
    onOpenChange(false);
    toast({ title: "Sessions revoked", description: `${pubkey.slice(0, 12)}…` });
  }

  return (
    <BusyConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Revoke sessions"
      description="Signs this user out on every device. They can sign back in; Developer API keys are not affected."
      confirmLabel="Confirm revoke"
      onConfirm={revoke}
      destructive
    />
  );
}
