import { Shield } from "lucide-react";

interface AdminBadgeProps {
  variant?: "light" | "dark";
}

export function AdminBadge({ variant = "light" }: AdminBadgeProps) {
  if (variant === "dark") {
    return (
      <div
        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30"
        data-testid="badge-admin"
      >
        <Shield className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
          Admin
        </span>
      </div>
    );
  }
  return (
    <div
      className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40"
      data-testid="badge-admin"
    >
      <Shield className="h-3.5 w-3.5 text-amber-600" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
        Admin
      </span>
    </div>
  );
}
