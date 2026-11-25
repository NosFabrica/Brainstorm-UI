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
  /**
   * Optional CSS filter to normalize this scene's exposure toward the rest of
   * the set — the source photos vary (airy outdoor vs moody indoor), so the
   * darker ones get a brightness lift so no single slide reads "off". Applied to
   * the <img> in both modes.
   */
  filter?: string;
  /**
   * Each variant at more than one width (`srcset` syntax), so a screen that
   * draws the photo small isn't sent the widest copy. Optional: a scene without
   * it serves `light`/`dark` alone.
   */
  srcSet?: { light: string; dark: string };
}

/**
 * The house photograph — the original homepage hero, which the homepage, the
 * login panel and onboarding all show. Served as WebP at 1920w and 1280w: the
 * 2880w JPEG it was cut from weighed 2.6 MB, and every surface draws it under
 * a heavy scrim, where the extra width was never visible.
 */
export const HERO_PHOTO = "/brand/hero-1920.webp";
export const HERO_PHOTO_SRCSET = "/brand/hero-1280.webp 1280w, /brand/hero-1920.webp 1920w";

const HERO_PHOTO_SCENE: HeroScene = {
  light: HERO_PHOTO,
  dark: HERO_PHOTO,
  srcSet: { light: HERO_PHOTO_SRCSET, dark: HERO_PHOTO_SRCSET },
  objectPosition: "center",
};

/**
 * Human-Signal hero photography (designer drop), one light + one dark variant
 * per scene, served as 1920w WebP (originals were 4K; scrimmed heroes don't need
 * it). The array order is the rotation order. Consumed by `HeroSceneRotator` on
 * the login brand panel. Files live in `client/public/brand/scenes/` — add or
 * reorder scenes here and it picks them up.
 */
export const HERO_SCENES: HeroScene[] = [
  {
    light: "/brand/scenes/scene-01-light.webp",
    dark: "/brand/scenes/scene-01-dark.webp",
    objectPosition: "center 40%",
  },
  {
    light: "/brand/scenes/scene-02-light.webp",
    dark: "/brand/scenes/scene-02-dark.webp",
    objectPosition: "center 42%",
  },
  {
    light: "/brand/scenes/scene-03-light.webp",
    dark: "/brand/scenes/scene-03-dark.webp",
    objectPosition: "center 38%",
  },
  {
    light: "/brand/scenes/scene-04-light.webp",
    dark: "/brand/scenes/scene-04-dark.webp",
    objectPosition: "center 40%",
  },
  {
    light: "/brand/scenes/scene-05-light.webp",
    dark: "/brand/scenes/scene-05-dark.webp",
    objectPosition: "center 35%",
  },
  // Festival is a genuine exposure outlier (dim, dusk) — a small nudge on top of
  // the shared SCENE_GRADE brings it to the set's target luminance.
  {
    light: "/brand/scenes/scene-06-light.webp",
    dark: "/brand/scenes/scene-06-dark.webp",
    objectPosition: "center 45%",
    filter: "brightness(1.14)",
  },
];

/**
 * The homepage rotation: the new scenes plus the ORIGINAL homepage photograph
 * (`HERO_PHOTO`), retained for continuity. That image predates the
 * light/dark pairs and has no separate dark variant, so it serves in both modes
 * exactly as it did before. Homepage only — the login panel keeps HERO_SCENES
 * (the purpose-built dark/lit scenes), so a bright daytime photo never lands on
 * that dark editorial panel.
 */
export const HOME_HERO_SCENES: HeroScene[] = [...HERO_SCENES, HERO_PHOTO_SCENE];

/**
 * The homepage runs a SINGLE static hero (guidelines pp.18–19 show one static
 * photo; Apple/Google-tier = restraint + total cohesion). `HERO_PHOTO` is the
 * strongest of the set and the only one whose Nodes motif is done per spec —
 * subtle, edge-anchored, off the faces. Same file both modes; the shaped scrim
 * adapts it (near-white/airy in light, prominent on Ink in dark). Kept as an
 * array so the rotator's grade/preload path is reused with zero rotation
 * (`scenes.length <= 1` disables the interval). `HERO_SCENES`/`HOME_HERO_SCENES`
 * stay available for a future curated rotation once clean plates land.
 */
export const HERO_SOLO: HeroScene[] = [HERO_PHOTO_SCENE];

// The login panel now uses HERO_SOLO (the single static HERO_PHOTO) too: its Nodes are
// baked in and edge-anchored, and the narrow login crop discards those side
// edges — so login reads effectively node-free without clean plates. The other
// photos have Nodes across the whole frame that no crop can hide.
