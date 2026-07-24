import { Monitor, Sun, Moon, type LucideIcon } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: LucideIcon }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Segmented System / Light / Dark control, driven by the shared ThemeProvider.
 * "System" live-tracks the OS preference; Light/Dark are persisted locks.
 */
export function ThemeToggle({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const { choice, setChoice } = useTheme();
  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={cn("inline-flex rounded-lg border border-border bg-muted/50 p-0.5", className)}
      data-testid="theme-toggle"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          onClick={() => setChoice(value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
            pad,
            choice === value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`theme-option-${value}`}
        >
          <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {label}
        </button>
      ))}
    </div>
  );
}
