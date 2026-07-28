import { HeroSceneRotator } from "@/components/brand/HeroSceneRotator";
import { HOME_HERO_SCENES } from "@/lib/heroScenes";

// The homepage backdrop (Design System v1.0, Homepage): a Human-Signals
// photograph with the Nodes overlay (baked into the asset), behind a
// theme-adaptive scrim. Light mode fades the photo to near-white (page 20);
// dark mode keeps it prominent on Ink (page 19). The scrim strengthens while a
// search is in progress so results stay readable. Photography supports the
// message — it never competes with the search.
export function HomeHeroBackground({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" data-testid="bg-home-hero">
      {/* One rich photo per scene (the full-exposure variant) — the SCRIM below
          does all the light/dark adaptation + reveal-on-search, exactly like the
          original hero.jpg. Avoids the double-fade the pre-faded light variants
          caused in light mode. */}
      <HeroSceneRotator variant="dark" scenes={HOME_HERO_SCENES} />
      {/* Theme-adaptive scrim (guidelines p18 Dark / p19 Light). LIGHT: a clean
          wash at rest, the photo REVEALS — comes forward — while searching. DARK:
          prominent photo on Ink at rest (p18), fading while searching so results
          stay readable. The designer's light variant is already high-key, so the
          rest wash is lighter (/70) than before to let it read. Opacity values
          must come from Tailwind's rendered scale (…60, 70, 90…) — non-scale
          steps like /92 or /55 generate NO rule (transparent). */}
      <div
        className={`absolute inset-0 transition-colors duration-700 ${
          dimmed ? "bg-white/50 dark:bg-slate-950/90" : "bg-white/70 dark:bg-slate-950/60"
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
