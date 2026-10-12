import { describe, expect, it } from "vitest";
import { tagMatchStrength } from "./tagMatch";
import { TRY_CHIPS } from "./tryChips";

/**
 * The "Try:" chips under the search box on /what-is-wot exist to show search
 * leading with tagged people. So each chip's words must name a people tag
 * outright — the rule in lib/tagMatch — or the click lands on a plain word
 * search with no tag on anyone, which is what "Podcasts" did against the
 * "Podcaster" tag.
 */
describe("TRY_CHIPS", () => {
  it("are Authors, Musicians and Podcasters, in that order", () => {
    expect(TRY_CHIPS.map((c) => c.label)).toEqual(["Authors", "Musicians", "Podcasters"]);
  });

  it("each opens the People tab, the one tab where a strongly named tag leads", () => {
    expect(TRY_CHIPS.map((c) => c.href)).toEqual([
      "/?q=Authors&t=people",
      "/?q=Musicians&t=people",
      "/?q=Podcasters&t=people",
    ]);
  });

  it("each names its people tag strongly, so the tagged people lead the results", () => {
    for (const chip of TRY_CHIPS) {
      expect(tagMatchStrength(chip.label, chip.tag), `${chip.label} → ${chip.tag}`).toBe("strong");
    }
    // The old chip did not: "Podcasts" is two edits from "Podcaster".
    expect(tagMatchStrength("Podcasts", "Podcaster")).toBe("weak");
  });
});
