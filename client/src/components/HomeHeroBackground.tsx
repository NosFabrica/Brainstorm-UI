// The homepage backdrop (Design System v1.0, Homepage): a Human-Signals
// photograph with the Nodes overlay (baked into the asset), behind a
// theme-adaptive scrim. Light mode fades the photo to near-white (page 20);
// dark mode keeps it prominent on Ink (page 19). The scrim strengthens while a
// search is in progress so results stay readable. Photography supports the
// message — it never competes with the search.
export function HomeHeroBackground({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" data-testid="bg-home-hero">
      <img
        src="/brand/hero.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      {/* Theme-adaptive scrim. */}
      <div
        className={`absolute inset-0 transition-colors duration-700 ${
          dimmed ? "bg-white/92 dark:bg-slate-950/85" : "bg-white/80 dark:bg-slate-950/55"
        }`}
      />
      {/* Aurora glow behind the hero for brand cohesion + legibility. */}
      <div className="absolute top-[6%] left-1/2 -translate-x-1/2 h-[42%] w-[66%] rounded-full bg-brand-accent/10 dark:bg-brand-primary/[0.16] blur-[130px]" />
      {/* Clean fades so the header + footer sit on the page background. */}
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white dark:from-slate-950 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white dark:from-slate-950 to-transparent" />
    </div>
  );
}
