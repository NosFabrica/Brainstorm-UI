import { Chip } from "@/components/ui/chip";

export function StatusBadge({ status }: { status: "connected" | "degraded" | "disconnected" }) {
  const config = {
    connected: { tone: "emerald" as const, label: "Connected" },
    degraded: { tone: "amber" as const, label: "Degraded" },
    disconnected: { tone: "red" as const, label: "Not Connected" },
  }[status];

  return (
    <Chip
      tone={config.tone}
      size="sm"
      dot
      className="font-semibold uppercase tracking-wider"
      data-testid={`badge-status-${status}`}
    >
      {config.label}
    </Chip>
  );
}
