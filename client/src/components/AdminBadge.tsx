import { Shield } from "lucide-react";
import { useLocation } from "wouter";

interface AdminBadgeProps {
  variant?: "light" | "dark";
}

/**
 * Admin role pill that doubles as a quick link to the admin dashboard —
 * clicking it (or activating via keyboard) navigates to /admin.
 */
export function AdminBadge({ variant = "light" }: AdminBadgeProps) {
  const [, navigate] = useLocation();
  const isDark = variant === "dark";
  const tone = isDark
    ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 focus-visible:ring-amber-400/50"
    : "bg-amber-500/15 border-amber-500/40 hover:bg-amber-500/25 focus-visible:ring-amber-500/40";
  const iconColor = isDark ? "text-amber-400" : "text-amber-600";
  const textColor = isDark ? "text-amber-300" : "text-amber-700";

  return (
    <button
      type="button"
      onClick={() => navigate("/admin")}
      title="Open admin dashboard"
      aria-label="Open admin dashboard"
      className={
        "hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer transition-all hover:shadow-sm active:scale-95 focus:outline-none focus-visible:ring-2 " +
        tone
      }
      data-testid="badge-admin"
    >
      <Shield className={"h-3.5 w-3.5 " + iconColor} />
      <span className={"text-[10px] font-bold uppercase tracking-wider " + textColor}>
        Admin
      </span>
    </button>
  );
}
