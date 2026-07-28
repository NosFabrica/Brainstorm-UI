export interface HeroScene {
  /** High-key/faded variant — reads under a LIGHT UI. */
  light: string;
  /** Moody variant with the lit Nodes constellation — reads on Ink (DARK UI). */
  dark: string;
}

/**
 * Human-Signal hero photography (designer drop), one light + one dark variant
 * per scene. The array order is the rotation order. Consumed by
 * `HeroSceneRotator` on the homepage hero (`HomeHeroBackground`) and the login
 * brand panel. Files live in `client/public/brand/scenes/` — add or reorder
 * scenes here and both surfaces pick it up.
 */
export const HERO_SCENES: HeroScene[] = [
  { light: "/brand/scenes/scene-01-light.jpg", dark: "/brand/scenes/scene-01-dark.jpg" },
  { light: "/brand/scenes/scene-02-light.jpg", dark: "/brand/scenes/scene-02-dark.jpg" },
  { light: "/brand/scenes/scene-03-light.jpg", dark: "/brand/scenes/scene-03-dark.jpg" },
  { light: "/brand/scenes/scene-04-light.jpg", dark: "/brand/scenes/scene-04-dark.jpg" },
  { light: "/brand/scenes/scene-05-light.jpg", dark: "/brand/scenes/scene-05-dark.jpg" },
  { light: "/brand/scenes/scene-06-light.jpg", dark: "/brand/scenes/scene-06-dark.jpg" },
];
