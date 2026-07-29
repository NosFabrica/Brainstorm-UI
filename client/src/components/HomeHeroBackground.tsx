import { HeroSceneRotator } from "@/components/brand/HeroSceneRotator";
import { HERO_SOLO } from "@/lib/heroScenes";

// The homepage backdrop (Design System v1.0, Homepage pp.18–19): a rotating
// Human-Signal photograph blended into the page with SHAPED light, not a flat
// veil. A radial gradient lifts contrast only behind the wordmark/search zone
// while the photo stays clear at its center and edges; theme-aware — near-white
// and airy in light (p19), prominent on Ink in dark (p18). Search stays the
// primary element; the imagery supports it and never competes.
export function HomeHeroBackground({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div
      className={`absolute inset-x-0 top-0 pointer-events-none overflow-hidden transition-[height] duration-500 ease-out ${dimmed ? "h-[420px]" : "h-screen"}`}
      aria-hidden="true"
      data-testid="bg-home-hero"
    >
      {/* A SINGLE static hero (hero.jpg) — restraint reads as tier, and this is
          the strongest image with the on-spec (subtle, edge-anchored) Nodes. The
          shaped scrim below adapts it to light/dark. */}
      <HeroSceneRotator variant="auto" scenes={HERO_SOLO} />

      {/* Shaped scrim that REVEALS the photo on search — the behavior we liked.
          At REST it's a full near-white (light, p19) / ink (dark, p18) fade, so
          the hero stays calm and the search leads. When a search starts the scrim
          THINS (opacity drops) so the photo comes FORWARD with its color — the
          "wake up" moment — sharp, no blur. Smooth opacity cross-fade; two layers
          toggled by the .dark class. */}
      <div
        className={`absolute inset-0 dark:hidden transition-opacity duration-500 ease-out ${dimmed ? "opacity-[0.68]" : "opacity-100"}`}
        style={{ background: "radial-gradient(125% 95% at 50% 42%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 45%, rgba(255,255,255,0.72) 100%)" }}
      />
      <div
        className={`absolute inset-0 hidden dark:block transition-opacity duration-500 ease-out ${dimmed ? "opacity-[0.52]" : "opacity-100"}`}
        style={{ background: "radial-gradient(130% 100% at 50% 42%, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0.70) 55%, rgba(2,6,23,0.58) 100%)" }}
      />

      {/* Clean fades so the header + footer dissolve into the page background. */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white dark:from-slate-950 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white dark:from-slate-950 to-transparent" />
    </div>
  );
}
