import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import brief from "./editorial.md?raw";

/**
 * The brief is one text in two apps: Amethyst's `EditorialBrief.kt` pins the same hash of its
 * trimmed text (EditorialBriefTest). Change both, and this, together.
 */
const BRIEF_SHA256 = "f3b16ee788ba8d859dfeb349c94c7facbf7158eaa02d5151ee94618972b24792";

describe("the editorial brief", () => {
  it("is the one Amethyst carries", () => {
    expect(createHash("sha256").update(brief.trim(), "utf8").digest("hex")).toBe(BRIEF_SHA256);
  });

  it("carries no corrections that contradict it", () => {
    // Folded into the body: no stacked corrections, no promise the app does not keep.
    for (const gone of [
      "Corrections for this harness",
      "Step 5",
      "both light and dark themes",
      "og:title",
      "twitter:",
      "UTC",
      "NO CONTINUITY",
      "thrown away",
      "second refusal",
      "jumble",
      "njump",
      "zap.stream",
      "shopstr",
    ]) {
      expect(brief, gone).not.toContain(gone);
    }
    for (const kept of [
      "Vol. I · No. N",
      '<style id="house"></style>',
      "<!-- sections:",
      "Every `<img>` has an `alt`",
      "Never describe a picture you have not seen",
      "a quote that fails is sent back to you to fix",
      "## The Kitchen",
      "Never invent a quantity",
      "<CITE_BASE><64-hex-event-id>",
      "<PROFILE_BASE><64-hex>",
    ]) {
      expect(brief, kept).toContain(kept);
    }
  });
});
