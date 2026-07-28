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
  // Festival is a genuine exposure outlier (dim, dusk) — a small nudge on top of
  // the shared SCENE_GRADE brings it to the set's target luminance.
  { light: "/brand/scenes/scene-06-light.webp", dark: "/brand/scenes/scene-06-dark.webp", objectPosition: "center 45%", filter: "brightness(1.14)" },
];

/**
 * The homepage rotation: the new scenes plus the ORIGINAL homepage photograph
 * (`/brand/hero.jpg`), retained for continuity. That image predates the
 * light/dark pairs and has no separate dark variant, so it serves in both modes
 * exactly as it did before. Homepage only — the login panel keeps HERO_SCENES
 * (the purpose-built dark/lit scenes), so a bright daytime photo never lands on
 * that dark editorial panel.
 */
export const HOME_HERO_SCENES: HeroScene[] = [
  ...HERO_SCENES,
  { light: "/brand/hero.jpg", dark: "/brand/hero.jpg", objectPosition: "center" },
];

/**
 * The homepage runs a SINGLE static hero (guidelines pp.18–19 show one static
 * photo; Apple/Google-tier = restraint + total cohesion). `hero.jpg` is the
 * strongest of the set and the only one whose Nodes motif is done per spec —
 * subtle, edge-anchored, off the faces. Same file both modes; the shaped scrim
 * adapts it (near-white/airy in light, prominent on Ink in dark). Kept as an
 * array so the rotator's grade/preload path is reused with zero rotation
 * (`scenes.length <= 1` disables the interval). `HERO_SCENES`/`HOME_HERO_SCENES`
 * stay available for a future curated rotation once clean plates land.
 */
export const HERO_SOLO: HeroScene[] = [
  { light: "/brand/hero.jpg", dark: "/brand/hero.jpg", objectPosition: "center" },
];

/**
 * The login brand panel's rotation. Per request: dropped the new mixer (01),
 * backyard party (02), podcast (04) and festival (06) scenes; kept the two worth
 * keeping (library 03, jam 05); and mixed the ORIGINAL login photos back in
 * (hero / hero-2 / hero-3). Those originals are single files (no light/dark
 * pair) — fine on the always-dark login panel.
 */
const REMOVED_FROM_LOGIN = ["scene-01-", "scene-02-", "scene-04-", "scene-06-"];
export const LOGIN_HERO_SCENES: HeroScene[] = [
  ...HERO_SCENES.filter((s) => !REMOVED_FROM_LOGIN.some((k) => s.dark.includes(k))),
  { light: "/brand/hero.jpg", dark: "/brand/hero.jpg", objectPosition: "center" },
  { light: "/brand/hero-2.jpg", dark: "/brand/hero-2.jpg", objectPosition: "center" },
  { light: "/brand/hero-3.jpg", dark: "/brand/hero-3.jpg", objectPosition: "center" },
];
