// @vitest-environment node
/**
 * The one reading of a video's shape. Search cards and tiles use it, and so
 * do the profile's video tiles: one rule for "square", so a Vine is square
 * everywhere or nowhere.
 */
import { describe, expect, it } from "vitest";
import { videoFrameStyle, videoShapeOf } from "./videoFrame";

describe("videoShapeOf", () => {
  it("is portrait for a video taller than it is wide", () => {
    expect(videoShapeOf({ width: 1080, height: 1920 })).toBe("portrait");
    expect(videoShapeOf({ width: 720, height: 1280 })).toBe("portrait");
    expect(videoShapeOf({ width: 4, height: 5 })).toBe("portrait");
  });

  it("is landscape for a video wider than it is tall", () => {
    expect(videoShapeOf({ width: 1920, height: 1080 })).toBe("landscape");
    expect(videoShapeOf({ width: 640, height: 480 })).toBe("landscape");
  });

  it("is square for equal sides", () => {
    expect(videoShapeOf({ width: 480, height: 480 })).toBe("square");
    expect(videoShapeOf({ width: 1080, height: 1080 })).toBe("square");
  });

  it("is square within 5% of equal sides, either way round, and not beyond", () => {
    expect(videoShapeOf({ width: 1080, height: 1088 })).toBe("square");
    expect(videoShapeOf({ width: 1088, height: 1080 })).toBe("square");
    // Exactly 5% apart, measured against the longer side.
    expect(videoShapeOf({ width: 950, height: 1000 })).toBe("square");
    expect(videoShapeOf({ width: 1000, height: 950 })).toBe("square");
    expect(videoShapeOf({ width: 940, height: 1000 })).toBe("portrait");
    expect(videoShapeOf({ width: 1000, height: 940 })).toBe("landscape");
  });

  it("is nothing when the size is missing", () => {
    expect(videoShapeOf(undefined)).toBeNull();
    expect(videoShapeOf(null)).toBeNull();
  });

  it("is nothing for a size that is not one", () => {
    for (const [width, height] of [
      [0, 0],
      [0, 480],
      [480, 0],
      [-480, 480],
      [480, -480],
      [Number.NaN, 480],
      [480, Number.NaN],
      [Number.POSITIVE_INFINITY, 480],
      [480, Number.POSITIVE_INFINITY],
    ]) {
      expect(videoShapeOf({ width, height })).toBeNull();
    }
    expect(videoShapeOf({} as { width: number; height: number })).toBeNull();
    expect(videoShapeOf({ width: "1080", height: "1920" } as unknown as { width: number; height: number })).toBeNull();
  });
});

describe("videoFrameStyle", () => {
  it("is the video's own proportions, and the width at which it reaches the tallest it may be", () => {
    expect(videoFrameStyle({ width: 1080, height: 1920 }, 34)).toEqual({
      aspectRatio: "1080 / 1920",
      maxWidth: "19.125rem",
    });
    expect(videoFrameStyle({ width: 480, height: 480 }, 34)).toEqual({ aspectRatio: "480 / 480", maxWidth: "34rem" });
  });

  it("is no narrower than a phone held upright and no wider than a banner", () => {
    expect(videoFrameStyle({ width: 100, height: 2000 }, 34)?.aspectRatio).toBe("9 / 16");
    expect(videoFrameStyle({ width: 4000, height: 100 }, 34)?.aspectRatio).toBe("3 / 1");
  });

  it("is nothing when the shape is not known", () => {
    expect(videoFrameStyle(undefined, 34)).toBeUndefined();
    expect(videoFrameStyle(null, 34)).toBeUndefined();
    expect(videoFrameStyle({ width: 0, height: 480 }, 34)).toBeUndefined();
  });
});
