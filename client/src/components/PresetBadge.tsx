import { presetFromBackend, presetDisplayLabel, type TrustPreset } from "@/services/trustThreshold";

type PresetBadgeProps = {
  preset: string | null | undefined;
  size?: "xs" | "sm";
  className?: string;
  testId?: string;
};

const STYLES: Record<TrustPreset, { bg: string; text: string; border: string; dot: string }> = {
  relax: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  default: {
    bg: "bg-indigo-50",
    text: "text-[#333286]",
    border: "border-[#7c86ff]/30",
    dot: "bg-[#7c86ff]",
  },
  strict: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
};

export function PresetBadge({ preset, size = "xs", className = "", testId }: PresetBadgeProps) {
  if (!preset) return null;
  const upper = preset.toUpperCase();
  if (upper !== "PERMISSIVE" && upper !== "DEFAULT" && upper !== "RESTRICTIVE") return null;
  const key = presetFromBackend(upper);
  const label = presetDisplayLabel(key);
  const style = STYLES[key];
  const sizeClass =
    size === "sm"
      ? "px-2.5 py-1 text-[10px]"
      : "px-2 py-0.5 text-[9px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border ${style.bg} ${style.border} ${style.text} ${sizeClass} font-bold uppercase tracking-widest whitespace-nowrap ${className}`}
      data-testid={testId}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
