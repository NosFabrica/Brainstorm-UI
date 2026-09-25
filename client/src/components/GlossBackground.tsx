/**
 * The homepage backdrop — a glossy white surface with a soft, cool aurora mesh
 * (Google/Gemini "premium marketing" feel): pure white, a few large, pale,
 * blurred washes of brand indigo + a faint violet + a whisper of sky drifting
 * across the upper area, a bright gloss highlight behind the hero for legibility
 * and sheen, and a clean fade to white at the bottom. No grid, no pattern — all
 * focus stays on the wordmark + search.
 */
export function GlossBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" data-testid="bg-gloss">
      {/* Base — pure white in light, Brainstorm Ink in dark. */}
      <div className="absolute inset-0 bg-white dark:bg-slate-950" />

      {/* The washes live in a first-screen box, not in % of the page: a page that
          grows as results stream in would otherwise move them on every arrival. */}
      <div className="absolute inset-x-0 top-0 h-[100dvh]">
        {/* Soft aurora mesh — cool, pale washes; slightly brighter in dark so the
            Aurora glow reads on the Ink base. Every blurred wash is its own layer
            (will-change-transform): iOS Safari otherwise re-rasterizes these
            100px+ blurs whenever anything above them repaints — ~260ms per
            keystroke in the search box. */}
        <div className="absolute -top-[16%] left-[2%] h-[52%] w-[52%] rounded-full bg-brand-accent/16 dark:bg-brand-accent/[0.14] blur-[130px] will-change-transform" />
        <div className="absolute -top-[10%] right-[4%] h-[48%] w-[46%] rounded-full bg-[#a78bfa]/11 dark:bg-[#a78bfa]/[0.16] blur-[140px] will-change-transform" />
        <div className="absolute top-[20%] -right-[12%] h-[46%] w-[44%] rounded-full bg-[#7dd3fc]/10 dark:bg-[#7dd3fc]/[0.10] blur-[150px] will-change-transform" />
        <div className="absolute top-[6%] -left-[12%] h-[46%] w-[42%] rounded-full bg-brand-deep/[0.06] dark:bg-brand-primary/[0.12] blur-[150px] will-change-transform" />

        {/* Bright gloss highlight behind the hero/search — a white sheen in light;
            hidden in dark (the aurora washes carry the glow there). */}
        <div className="absolute top-[2%] left-1/2 h-[46%] w-[78%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.7),_transparent_72%)] blur-2xl will-change-transform dark:hidden" />
      </div>

      {/* Clean fade at the bottom to ground the page — to white in light, to Ink in dark. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-white dark:via-slate-950/20 dark:to-slate-950" />
    </div>
  );
}
