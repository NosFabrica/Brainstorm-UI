export interface HeroScene {
  /** High-key/faded variant — reads under a LIGHT UI. */
  light: string;
  /** Moody variant with the lit Nodes constellation — reads on Ink (DARK UI). */
  dark: string;
  /**
   * CSS object-position for this scene's photo (default "center"). Tune when a
   * tall/narrow crop (e.g. the login panel) would cut a face or the focal group
   * — e.g. "center 38%" keeps upper-body subjects in frame.
   */
  objectPosition?: string;
}

/**
 * Human-Signal hero photography (designer drop), one light + one dark variant
 * per scene, served as 1920w WebP (originals were 4K; scrimmed heroes don't need
 * it). The array order is the rotation order. Consumed by `HeroSceneRotator` on
 * the homepage hero (`HomeHeroBackground`) and the login brand panel. Files live
 * in `client/public/brand/scenes/` — add or reorder scenes here and both
 * surfaces pick it up.
 */
export const HERO_SCENES: HeroScene[] = [
  { light: "/brand/scenes/scene-01-light.webp", dark: "/brand/scenes/scene-01-dark.webp", objectPosition: "center 40%" },
  { light: "/brand/scenes/scene-02-light.webp", dark: "/brand/scenes/scene-02-dark.webp", objectPosition: "center 42%" },
  { light: "/brand/scenes/scene-03-light.webp", dark: "/brand/scenes/scene-03-dark.webp", objectPosition: "center 38%" },
  { light: "/brand/scenes/scene-04-light.webp", dark: "/brand/scenes/scene-04-dark.webp", objectPosition: "center 40%" },
  { light: "/brand/scenes/scene-05-light.webp", dark: "/brand/scenes/scene-05-dark.webp", objectPosition: "center 35%" },
  { light: "/brand/scenes/scene-06-light.webp", dark: "/brand/scenes/scene-06-dark.webp", objectPosition: "center 45%" },
];
