import { describe, expect, it } from "vitest";
import { networkPerspective } from "@/lib/networkPerspective";

describe("networkPerspective — whose scores the Network page shows, and how it says so", () => {
  it("the reader's own, once they have a calculation and chose their perspective", () => {
    expect(networkPerspective({ signedIn: true, calcDone: true, scorePov: "personalized" })).toEqual({
      house: false,
      pov: "personalized",
      label: "Scores from your perspective",
      canPersonalize: true,
    });
  });

  it("Brainstorm's when they chose it", () => {
    expect(networkPerspective({ signedIn: true, calcDone: true, scorePov: "global" })).toEqual({
      house: true,
      pov: "global",
      label: "Scores from Brainstorm's perspective",
      canPersonalize: true,
    });
  });

  it("Brainstorm's until their calculation exists, and says why", () => {
    expect(networkPerspective({ signedIn: true, calcDone: false, scorePov: "personalized" })).toEqual({
      house: true,
      pov: "global",
      label: "Scores from Brainstorm's perspective until yours is ready",
      canPersonalize: false,
    });
  });

  it("Brainstorm's when signed out", () => {
    expect(networkPerspective({ signedIn: false, calcDone: false, scorePov: "global" })).toMatchObject({
      house: true,
      pov: "global",
      canPersonalize: false,
    });
  });
});
