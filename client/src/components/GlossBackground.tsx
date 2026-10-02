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
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="bg-gloss">
      {/* Base — pure white in light, Brainstorm Ink in dark. */}
      <div className="absolute inset-0 bg-white dark:bg-slate-950" />

      {/* The washes live in a first-screen box, not in % of the page: a page that
          grows as results stream in would otherwise move them on every arrival. */}
      <div className="absolute inset-x-0 top-0 h-[100dvh]">
        {/* Soft aurora mesh — cool, pale washes; slightly brighter in dark so the
            Aurora glow reads on the Ink base. Gradients, not blurred blobs
            (.gloss-wash): iOS Safari froze the search page for ~7s at a time
            re-rendering 130–150px blurs while results streamed in, layer or no
            layer. Each box is the old blob grown by 1.75× its blur radius.
            The first two have no light-mode wash: their old /16 and /11
            opacities never compiled, so light mode never showed them. */}
        <div className="gloss-wash absolute left-[calc(2%-228px)] top-[calc(-16%-228px)] h-[calc(52%+455px)] w-[calc(52%+455px)] [--wash-a:0] [--wash:var(--brand-accent)] dark:[--wash-a:0.14]" />
        <div className="gloss-wash absolute right-[calc(4%-245px)] top-[calc(-10%-245px)] h-[calc(48%+490px)] w-[calc(46%+490px)] [--wash-a:0] [--wash:167_139_250] dark:[--wash-a:0.16]" />
        <div className="gloss-wash absolute right-[calc(-12%-263px)] top-[calc(20%-263px)] h-[calc(46%+525px)] w-[calc(44%+525px)] [--wash-a:0.1] [--wash:125_211_252]" />
        <div className="gloss-wash absolute left-[calc(-12%-263px)] top-[calc(6%-263px)] h-[calc(46%+525px)] w-[calc(42%+525px)] [--wash-a:0.06] [--wash:var(--brand-deep)] dark:[--wash-a:0.12] dark:[--wash:var(--brand-primary)]" />

        {/* Bright gloss highlight behind the hero/search — a white sheen in light;
            hidden in dark (the aurora washes carry the glow there). Its gradient
            fades out on its own; it needs no blur, and so no layer. */}
        <div className="absolute left-1/2 top-[2%] h-[46%] w-[78%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.7),_transparent_72%)] dark:hidden" />
      </div>

      {/* Clean fade at the bottom to ground the page — to white in light, to Ink in dark. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-white dark:via-slate-950/20 dark:to-slate-950" />
    </div>
  );
}
