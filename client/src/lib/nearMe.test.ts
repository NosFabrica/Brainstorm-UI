import { describe, expect, it } from "vitest";
import { areaAround, locate } from "./nearMe";

// "Near me": a box around a position, the size a walk or a short drive
// covers, and the one ask of the browser — only when the person taps.
describe("areaAround", () => {
  it("draws a box the given distance around a position", () => {
    // Austin, 5 km: a degree of latitude is ~111 km; longitude shrinks with cos(lat).
    const box = areaAround({ lat: 30.27, lon: -97.74 }, 5);
    expect(box.north - box.south).toBeCloseTo(0.09, 2);
    expect((box.north + box.south) / 2).toBeCloseTo(30.27, 6);
    expect(box.east - box.west).toBeCloseTo(0.104, 2);
    expect((box.east + box.west) / 2).toBeCloseTo(-97.74, 6);
  });
});

describe("locate", () => {
  it("asks the browser once and hands back the position", async () => {
    const geo = {
      getCurrentPosition: (ok: (p: { coords: { latitude: number; longitude: number } }) => void) =>
        ok({ coords: { latitude: 1.5, longitude: 2.5 } }),
    };
    await expect(locate(geo as unknown as Geolocation)).resolves.toEqual({ lat: 1.5, lon: 2.5 });
  });

  it("says why when it can't: declined, unavailable, or no such thing in this browser", async () => {
    const declined = { getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }) };
    await expect(locate(declined as unknown as Geolocation)).rejects.toMatchObject({ reason: "declined" });
    const lost = { getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 2 }) };
    await expect(locate(lost as unknown as Geolocation)).rejects.toMatchObject({ reason: "unavailable" });
    await expect(locate(undefined)).rejects.toMatchObject({ reason: "unsupported" });
  });
});
