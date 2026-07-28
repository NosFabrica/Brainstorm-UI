import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";

/**
 * DEV-ONLY hero background lab (route: /hero-lab, unlisted). Click through the
 * candidate photos as the REAL home hero — same scrim, wordmark, search bar, and
 * reveal-on-search behavior — to choose a base image. Toggles: light/dark, the
 * search (reveal) state, and a Nodes overlay preview (guidelines p10 — the
 * purple/cyan constellation, Lighten-blended, kept off-center/away from faces).
 *
 * NOTE: candidates are 768px portrait sources cover-cropped to 16:9, so they're
 * soft here — good for choosing a DIRECTION; the winner gets re-sourced hi-res
 * (~2560×1440 landscape) with nodes composited before it goes live.
 */
// Shortlist — Benjamin's picks (2, 6, 7, 9, 10, 12). The full 13-candidate set
// lives in git history if we ever want to revisit the others.
const CANDIDATES = [
  { file: "cand-02.webp", src: "45815f39…" },
  { file: "cand-06.webp", src: "9772090d…" },
  { file: "cand-07.webp", src: "a1cd4917…" },
  { file: "cand-09.webp", src: "cdf43ffe…" },
  { file: "cand-10.webp", src: "d0983274…" },
  { file: "cand-12.webp", src: "fae82f83…" },
  // New abstract/atmospheric direction (light + airy).
  { file: "cand-14.webp", src: "88a779d6… salt-flat horizon" },
  { file: "cand-15.webp", src: "4372d3ba… sunlit tree" },
  { file: "cand-16.webp", src: "77a79d77… light rays" },
];

/** Per-image Nodes layouts (guidelines p10): each picks a safe zone in that
 *  photo — away from faces + important detail, and off the light areas that
 *  wash out a Lighten blend. viewBox space is 1920×1080. */
type Dot = [number, number, string];
type Layout = { lines: string[]; dots: Dot[] };
const P = "#7237ff", V = "#8b5cf6", C = "#13d2e5";

const NODE_LAYOUTS: Record<string, Layout> = {
  // 02 clouds → blue-sky gaps, upper-right (white clouds wash out light nodes)
  "cand-02.webp": {
    lines: ["M1040,170 C1180,120 1320,220 1500,180", "M1500,180 C1660,150 1740,300 1660,440", "M1040,170 C1000,320 1180,340 1300,300"],
    dots: [[1040, 170, C], [1200, 130, P], [1360, 205, C], [1500, 180, V], [1660, 150, C], [1720, 300, P], [1660, 440, C], [1300, 300, V], [1140, 330, C]],
  },
  // 06 library → upper third (shelves/stairs), above the readers
  "cand-06.webp": {
    lines: ["M240,220 C440,150 680,260 900,200", "M900,200 C1140,150 1360,250 1560,190", "M1560,190 C1680,230 1760,300 1740,360"],
    dots: [[240, 220, P], [460, 160, C], [700, 240, V], [900, 200, P], [1140, 170, C], [1360, 230, P], [1560, 190, C], [1740, 320, V]],
  },
  // 07 networking → faces fill the frame; safe zone is the lower foreground
  "cand-07.webp": {
    lines: ["M220,930 C440,860 640,980 860,910", "M860,910 C1080,850 1300,970 1520,910", "M1520,910 C1640,940 1740,900 1800,960"],
    dots: [[220, 930, C], [440, 980, P], [640, 920, C], [860, 910, V], [1080, 950, C], [1300, 905, P], [1520, 910, C], [1720, 950, V]],
  },
  // 09 social/beers → faces span the frame; safe zone is the low foreground
  // (shirts + drinks below the faces), weaving between the amber glasses
  "cand-09.webp": {
    lines: ["M160,900 C380,840 560,950 780,890", "M780,890 C1000,830 1220,940 1440,880", "M1440,880 C1580,910 1700,870 1800,930"],
    dots: [[160, 900, P], [380, 950, C], [560, 895, V], [780, 890, C], [1000, 940, P], [1220, 885, C], [1440, 880, V], [1640, 895, C], [1800, 930, P]],
  },
  // 10 city sunset → left + right building faces, clear of the bright center
  "cand-10.webp": {
    lines: ["M200,300 C340,220 480,420 560,540", "M200,300 C120,460 300,520 360,600", "M1420,270 C1560,190 1720,320 1780,470", "M1420,270 C1360,420 1540,450 1600,540"],
    dots: [[200, 300, P], [400, 210, C], [560, 440, V], [340, 580, C], [1420, 270, C], [1660, 200, P], [1780, 470, C], [1560, 430, V]],
  },
  // 12 outdoor social → top band (trees + roofline), above heads
  "cand-12.webp": {
    lines: ["M240,190 C460,250 700,150 900,210", "M900,210 C1120,140 1340,220 1520,170", "M1520,170 C1640,200 1740,150 1800,230"],
    dots: [[240, 190, C], [480, 240, P], [700, 155, C], [900, 210, V], [1140, 160, C], [1360, 210, P], [1520, 170, C], [1760, 220, V]],
  },
};
const DEFAULT_LAYOUT: Layout = {
  lines: ["M120,880 C360,700 520,940 760,820", "M760,820 C980,720 1080,900 1240,860", "M1600,300 C1500,480 1720,560 1660,760"],
  dots: [[120, 880, P], [360, 760, V], [520, 900, C], [760, 820, P], [1000, 830, C], [1240, 860, P], [1600, 300, C], [1660, 760, P]],
};

/** Procedural Nodes overlay — purple/cyan points + connecting lines with a soft
 *  glow, Lighten-blended so only the light overlay shows over the photo. */
function NodesOverlay({ file }: { file: string }) {
  const layout = NODE_LAYOUTS[file] ?? DEFAULT_LAYOUT;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full mix-blend-lighten"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <linearGradient id="nodeLine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7237ff" />
          <stop offset="1" stopColor="#13d2e5" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#nodeLine)" strokeWidth="1.5" opacity="0.85">
        {layout.lines.map((d, k) => <path key={k} d={d} />)}
      </g>
      {layout.dots.map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 7 : 4.5} fill={c} filter="url(#nodeGlow)" />
      ))}
    </svg>
  );
}


export default function HeroLab() {
  const [i, setI] = useState(0);
  const [dark, setDark] = useState(true);
  const [searching, setSearching] = useState(false);
  const [nodes, setNodes] = useState(true);

  const n = CANDIDATES.length;
  const prev = () => setI((v) => (v - 1 + n) % n);
  const next = () => setI((v) => (v + 1) % n);

  // The app's ThemeProvider sets `.dark` on <html>, and Tailwind `dark:`
  // variants fire from any ancestor — so a local wrapper class can't override
  // it. Drive the real <html> class from the lab toggle instead, and restore
  // the user's theme when leaving the lab.
  useEffect(() => {
    const html = document.documentElement;
    const original = html.classList.contains("dark");
    return () => { html.classList.toggle("dark", original); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key.toLowerCase() === "d") setDark((v) => !v);
      else if (e.key.toLowerCase() === "s") setSearching((v) => !v);
      else if (e.key.toLowerCase() === "n") setNodes((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Preload neighbours for instant switching.
  useEffect(() => {
    [i, (i + 1) % n, (i - 1 + n) % n].forEach((k) => {
      const img = new Image();
      img.src = `/brand/hero-lab/${CANDIDATES[k].file}`;
    });
  }, [i, n]);

  const cand = CANDIDATES[i];
  // Same scrim curve as the live hero — reveal-on-search in BOTH themes: calm at
  // rest (near-white in light, dim ink in dark), photo comes FORWARD on search.
  const scrim = searching ? "bg-white/60 dark:bg-slate-950/40" : "bg-white/80 dark:bg-slate-950/75";

  return (
    <div className={dark ? "dark" : ""}>
      <div className="relative h-screen w-screen overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
        {/* Hero background — mirrors HomeHeroBackground */}
        <div className="absolute inset-0">
          <img key={cand.file} src={`/brand/hero-lab/${cand.file}`} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
          {nodes && <NodesOverlay file={cand.file} />}
          <div className={`absolute inset-0 transition-colors duration-500 ${scrim}`} />
          <div className="absolute left-1/2 top-[6%] h-[42%] w-[66%] -translate-x-1/2 rounded-full bg-brand-accent/10 blur-[130px] dark:bg-brand-primary/[0.16]" />
          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent dark:from-slate-950" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent dark:from-slate-950" />
        </div>

        {/* Hero content mock (for text legibility) */}
        <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-4 text-center">
          <Wordmark height={52} className="mx-auto dark:hidden" />
          <Wordmark height={52} variant="white" className="mx-auto hidden dark:block" />
          <p className="mt-2.5 text-base font-medium text-slate-700 drop-shadow-sm dark:text-slate-100 sm:text-lg">Search through the people you trust.</p>
          <div className="mt-8 flex w-full items-center gap-2 rounded-full border border-slate-200 bg-white py-2 pl-5 pr-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-900">
            <span className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-400 dark:border-slate-500" />
            <span className="flex-1 truncate text-left text-base text-slate-400 dark:text-slate-500">Search people and topics…</span>
            <span className="rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white">Search</span>
          </div>
        </div>

        {/* Controls */}
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-slate-950/80 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-white">
            <div className="flex items-center gap-3">
              <button onClick={prev} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">←</button>
              <div className="tabular-nums text-sm font-semibold">
                {i + 1} / {n} <span className="ml-2 font-mono text-xs text-white/50">{cand.file} · {cand.src}</span>
              </div>
              <button onClick={next} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/20">→</button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {CANDIDATES.map((_, k) => (
                <button key={k} onClick={() => setI(k)} aria-label={`Image ${k + 1}`}
                  className={`h-2 w-2 rounded-full transition-colors ${k === i ? "bg-brand-accent" : "bg-white/30 hover:bg-white/50"}`} />
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <button onClick={() => setDark((v) => !v)} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">{dark ? "☾ Dark" : "☀ Light"}</button>
              <button onClick={() => setSearching((v) => !v)} className={`rounded-lg px-3 py-1.5 ${searching ? "bg-brand-primary" : "bg-white/10 hover:bg-white/20"}`}>Search state</button>
              <button onClick={() => setNodes((v) => !v)} className={`rounded-lg px-3 py-1.5 ${nodes ? "bg-brand-accent text-slate-900" : "bg-white/10 hover:bg-white/20"}`}>Nodes</button>
            </div>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-[11px] text-white/40">← → switch · D theme · S search state · N nodes · candidates are soft (768px source) — winner gets re-sourced hi-res</p>
        </div>
      </div>
    </div>
  );
}
