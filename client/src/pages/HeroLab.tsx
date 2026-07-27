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
const CANDIDATES = [
  { file: "cand-01.webp", src: "1c2f0272…" },
  { file: "cand-02.webp", src: "45815f39…" },
  { file: "cand-03.webp", src: "579a584b…" },
  { file: "cand-04.webp", src: "820e0c22…" },
  { file: "cand-05.webp", src: "9320c79a…" },
  { file: "cand-06.webp", src: "9772090d…" },
  { file: "cand-07.webp", src: "a1cd4917…" },
  { file: "cand-08.webp", src: "b6eb20ff…" },
  { file: "cand-09.webp", src: "cdf43ffe…" },
  { file: "cand-10.webp", src: "d0983274…" },
  { file: "cand-11.webp", src: "e1dc53a8…" },
  { file: "cand-12.webp", src: "fae82f83…" },
  { file: "cand-13.webp", src: "grok-c40a3306…" },
];

/** Procedural Nodes overlay — an approximation of the brand Nodes asset
 *  (guidelines p10): purple/cyan points + connecting lines with a soft glow,
 *  Lighten-blended so only the light lines show over the photo. Positioned in
 *  the lower band + right edge to stay clear of the centered wordmark/search. */
function NodesOverlay() {
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
        <path d="M120,880 C360,700 520,940 760,820" />
        <path d="M760,820 C980,720 1080,900 1240,860" />
        <path d="M1600,300 C1500,480 1720,560 1660,760" />
        <path d="M1660,760 C1600,900 1780,940 1840,880" />
        <path d="M120,880 C300,980 200,1020 420,1010" />
      </g>
      {[
        [120, 880, "#7237ff"], [360, 760, "#8b5cf6"], [520, 900, "#13d2e5"],
        [760, 820, "#7237ff"], [1000, 830, "#13d2e5"], [1240, 860, "#7237ff"],
        [1600, 300, "#13d2e5"], [1660, 760, "#7237ff"], [1840, 880, "#13d2e5"],
        [420, 1010, "#8b5cf6"],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={i % 3 === 0 ? 7 : 4.5} fill={c as string} filter="url(#nodeGlow)" />
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
  // Same scrim curve as the live hero (reveal-on-search in light; fade in dark).
  const scrim = searching ? "bg-white/60 dark:bg-slate-950/90" : "bg-white/80 dark:bg-slate-950/60";

  return (
    <div className={dark ? "dark" : ""}>
      <div className="relative h-screen w-screen overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
        {/* Hero background — mirrors HomeHeroBackground */}
        <div className="absolute inset-0">
          <img key={cand.file} src={`/brand/hero-lab/${cand.file}`} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
          {nodes && <NodesOverlay />}
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
