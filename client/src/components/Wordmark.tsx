import { cn } from "@/lib/utils";

// The Brainstorm handwritten wordmark — the DEFAULT brand signature per Design
// System v1.0 ("the handwritten wordmark is the default brand signature; the
// standalone B symbol is used wherever a compact identifier is required").
// Rendered as a self-contained SVG <img> (native gradient, crisp at any size).
//
// Variants: "gradient" (Aurora Purple→Cyan, the default; reads on light and dark
// surfaces), "white" (for dark photography / Human-Signal imagery), "black".
// The mark's aspect ratio is 328:73 (~4.49:1); set `height` and the width follows.

type WordmarkVariant = "gradient" | "white" | "black";

const SRC: Record<WordmarkVariant, string> = {
  gradient: "/brand/wordmark.svg",
  white: "/brand/wordmark-white.svg",
  black: "/brand/wordmark-black.svg",
};

export function Wordmark({
  height = 24,
  variant = "gradient",
  className,
}: {
  height?: number;
  variant?: WordmarkVariant;
  className?: string;
}) {
  return (
    <img
      src={SRC[variant]}
      alt="Brainstorm"
      height={height}
      style={{ height, width: "auto" }}
      className={cn("select-none", className)}
      draggable={false}
      data-testid="wordmark"
    />
  );
}
