import { HeroSceneRotator } from "@/components/brand/HeroSceneRotator";
import { HOME_HERO_SCENES } from "@/lib/heroScenes";

// The homepage backdrop (Design System v1.0, Homepage pp.18–19): a rotating
// Human-Signal photograph blended into the page with SHAPED light, not a flat
// veil. A radial gradient lifts contrast only behind the wordmark/search zone
// while the photo stays clear at its center and edges; theme-aware — near-white
// and airy in light (p19), prominent on Ink in dark (p18). Search stays the
// primary element; the imagery supports it and never competes.
export function HomeHeroBackground({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true" data-testid="bg-home-hero">
      {/* Theme-aware photography: the high-key LIGHT variant in light mode, the
          moody lit DARK variant on Ink. A shared grade keeps the set cohesive. */}
      <HeroSceneRotator variant="auto" scenes={HOME_HERO_SCENES} />

      {/* Shaped text-protection gradient — the craft move that replaces the flat
          veil. It only lifts contrast behind the wordmark/search zone and fades
          to clear at the edges, so the photo breathes. LIGHT: a soft white core
          → near-white/airy (p19). DARK: an ink core, photo staying prominent
          (p18). Two layers toggled by the .dark class. */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{ background: "radial-gradient(120% 78% at 50% 40%, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.46) 50%, rgba(255,255,255,0.08) 100%)" }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{ background: "radial-gradient(120% 78% at 50% 40%, rgba(2,6,23,0.74) 0%, rgba(2,6,23,0.34) 50%, rgba(2,6,23,0) 100%)" }}
      />

      {/* Gentle focus while a search is in progress — the photo recedes a touch
          (one direction, no restless reveal). */}
      {dimmed && <div className="absolute inset-0 bg-white/20 dark:bg-slate-950/30 transition-opacity duration-500" />}

      {/* Clean fades so the header + footer dissolve into the page background. */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white dark:from-slate-950 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white dark:from-slate-950 to-transparent" />
    </div>
  );
}
