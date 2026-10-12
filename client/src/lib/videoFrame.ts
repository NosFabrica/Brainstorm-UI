/**
 * The shape a video is drawn in, from the size its imeta gives (`dim`, read by
 * `readVideo` in lib/nip71): upright for Divine's 1080x1920, square for a
 * classic Vine's 480x480, wide for the rest. Known before the file loads, so
 * a frame can hold its place instead of jumping when the video arrives.
 *
 * `videoShapeOf` is the one reading of shape for every surface that frames a
 * video by it: search cards and tiles here, the profile's video tiles too.
 */
import type { CSSProperties } from "react";

export interface VideoDim {
  width: number;
  height: number;
}

export type VideoShape = "portrait" | "square" | "landscape";

/** Within this much of equal sides, a video is square: 1080x1088 is. */
const SQUARE_SLACK = 0.05;
/** No frame is narrower than a phone held upright, or wider than a banner. */
const NARROWEST = { width: 9, height: 16 };
const WIDEST = { width: 3, height: 1 };

const isSide = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * Portrait, square (sides within 5% of each other, against the longer one) or
 * landscape. Null when there is no size or it is not one: a side that is
 * missing, zero, negative or not a finite number.
 */
export function videoShapeOf(dim: VideoDim | null | undefined): VideoShape | null {
  if (!dim || !isSide(dim.width) || !isSide(dim.height)) return null;
  const { width, height } = dim;
  if (Math.abs(width - height) / Math.max(width, height) <= SQUARE_SLACK) return "square";
  return height > width ? "portrait" : "landscape";
}

/**
 * A frame in the video's own proportions that is never taller than
 * `maxHeightRem`: as wide as its container up to the width at which it would
 * reach that height. Nothing when the size is not known.
 */
export function videoFrameStyle(dim: VideoDim | null | undefined, maxHeightRem: number): CSSProperties | undefined {
  if (!dim || !videoShapeOf(dim)) return undefined;
  const ratio = dim.width / dim.height;
  const { width, height } =
    ratio < NARROWEST.width / NARROWEST.height ? NARROWEST : ratio > WIDEST.width / WIDEST.height ? WIDEST : dim;
  return {
    aspectRatio: `${width} / ${height}`,
    maxWidth: `${Math.round(((maxHeightRem * width) / height) * 1000) / 1000}rem`,
  };
}
