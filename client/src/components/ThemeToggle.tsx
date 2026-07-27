import { Monitor, Sun, Moon, type LucideIcon } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: LucideIcon }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * System / Light / Dark control, driven by the shared ThemeProvider. "System"
 * live-tracks the OS preference; Light/Dark are persisted locks.
 *
 * Two layouts: the default "segmented" pill (compact, inline) and "stack" —
 * three full-width tiles with the selected option filled in brand color, used
 * in the account menu for a more premium, tappable Appearance section.
 */
export function ThemeToggle({
  className,
  size = "md",
  layout = "segmented",
}: {
  className?: string;
  size?: "sm" | "md";
  layout?: "segmented" | "stack";
}) {
  const { choice, setChoice } = useTheme();

  if (layout === "stack") {
    return (
      <div role="radiogroup" aria-label="Appearance" className={cn("grid gap-1.5", className)} data-testid="theme-toggle">
        {OPTIONS.map(({ value, label, Icon }) => {
          const selected = choice === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(value)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                selected
                  ? "bg-brand-primary text-white shadow-sm"
                  : "border border-border/70 bg-card/50 text-foreground hover:bg-muted/60",
              )}
              data-testid={`theme-option-${value}`}
            >
              <Icon className={cn("h-4 w-4", selected ? "text-white" : "text-muted-foreground")} />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

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
