/**
 * The brand's "Nodes" constellation (Design System v1.0, guidelines p10) — a
 * procedural web of purple/cyan points joined by soft glowing lines. It's the
 * signature Web-of-Trust motif: people (dots) connected by trust (lines).
 *
 * Rendered as an absolutely-positioned SVG that fills its relative parent and
 * `mix-blend-lighten`s over hero imagery, so only the light constellation shows
 * through and it never darkens faces. Each layout is hand-placed into a safe
 * zone (away from faces + bright areas that wash out a Lighten blend).
 *
 * Pass an explicit {@link NodesLayout} (HeroLab tunes one per candidate photo)
 * or pick a named {@link NodesPreset} for the product hero surfaces.
 */
export type NodeDot = [number, number, string];
export type NodesLayout = { lines: string[]; dots: NodeDot[] };

// Aurora points — Purple, mid-Violet, Cyan. Kept as literals (not tokens) because
// this paints inside an SVG gradient/fill, not the Tailwind color pipeline.
export const NODE_PURPLE = "#7237ff";
export const NODE_VIOLET = "#8b5cf6";
export const NODE_CYAN = "#13d2e5";
const P = NODE_PURPLE, V = NODE_VIOLET, C = NODE_CYAN;

/** Named constellations tuned for the product hero surfaces (viewBox 1920×1080). */
export type NodesPreset = "login" | "share" | "onboarding" | "default";

const PRESETS: Record<NodesPreset, NodesLayout> = {
  // Tall left panel (login). It's cropped to the central x-band by `slice`, so
  // the weave lives in x≈640–1280 and runs the full height, sitting behind the
  // z-10 copy as subtle brand texture over the ink scrim.
  login: {
    lines: [
      "M760,120 C980,260 720,440 900,600",
      "M900,600 C1080,760 820,880 980,1000",
      "M760,120 C620,300 820,380 760,560",
    ],
    dots: [[760, 120, C], [900, 250, P], [1020, 400, C], [740, 480, V], [900, 600, P], [1080, 720, C], [820, 840, P], [980, 1000, C], [700, 320, V]],
  },
  // Wide banner (share hero) — an arc across the upper band, above avatar + name.
  share: {
    lines: [
      "M180,220 C480,120 760,280 1040,180",
      "M1040,180 C1320,100 1560,240 1780,170",
      "M1780,170 C1840,260 1760,340 1660,360",
    ],
    dots: [[180, 220, P], [460, 140, C], [760, 275, V], [1040, 180, P], [1320, 130, C], [1560, 235, P], [1780, 170, C], [1660, 360, V]],
  },
  // Onboarding hero — a rising diagonal, lower-left to upper-right, framing copy.
  onboarding: {
    lines: [
      "M160,880 C420,760 560,900 800,780",
      "M800,780 C1040,660 1280,800 1520,680",
      "M1520,680 C1660,620 1760,660 1820,560",
    ],
    dots: [[160, 880, C], [420, 760, P], [640, 830, V], [800, 780, C], [1080, 720, P], [1280, 800, C], [1520, 680, P], [1720, 620, V], [1820, 560, C]],
  },
  default: {
    lines: [
      "M120,880 C360,700 520,940 760,820",
      "M760,820 C980,720 1080,900 1240,860",
      "M1600,300 C1500,480 1720,560 1660,760",
    ],
    dots: [[120, 880, P], [360, 760, V], [520, 900, C], [760, 820, P], [1000, 830, C], [1240, 860, P], [1600, 300, C], [1660, 760, P]],
  },
};

interface NodesOverlayProps {
  /** An explicit constellation. Wins over `preset` when both are given. */
  layout?: NodesLayout;
  /** One of the named product presets. Defaults to `"default"`. */
  preset?: NodesPreset;
  /** Extra classes on the SVG (positioning / opacity fades). */
  className?: string;
  /** Line + dot opacity (0–1). Lower it over busier photos. */
  opacity?: number;
  /** Stable id suffix so multiple overlays on one page don't share `<defs>`. */
  idSuffix?: string;
}

export function NodesOverlay({ layout, preset = "default", className = "", opacity = 0.85, idSuffix = preset }: NodesOverlayProps) {
  const resolved = layout ?? PRESETS[preset];
  const glowId = `nodeGlow-${idSuffix}`;
  const lineId = `nodeLine-${idSuffix}`;
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full mix-blend-lighten ${className}`}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={NODE_PURPLE} />
          <stop offset="1" stopColor={NODE_CYAN} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${lineId})`} strokeWidth="1.5" opacity={opacity}>
        {resolved.lines.map((d, k) => <path key={k} d={d} />)}
      </g>
      {resolved.dots.map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 7 : 4.5} fill={c} filter={`url(#${glowId})`} opacity={opacity} />
      ))}
    </svg>
  );
}
