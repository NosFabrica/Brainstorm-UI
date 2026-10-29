/**
 * A town's events on its places' map: the ones still to come (or on now)
 * that say where they are as a geohash (`g`, NIP-52); one with only a
 * written location has no pin, and stays in the list beside the map.
 */
import { describe, expect, it } from "vitest";
import { eventPins } from "./eventPins";

const NOW = 1_800_000_000;
const ev = (id: string, kind: number, tags: string[][]) => ({
  id,
  kind,
  pubkey: "a".repeat(64),
  created_at: 1,
  content: "",
  tags,
});

describe("eventPins", () => {
  it("pins an upcoming event where its geohash says, with its title and when", () => {
    const [pin] = eventPins(
      [
        ev("1", 31923, [
          ["title", "Bitcoin & Coffee"],
          ["start", String(NOW + 3600)],
          ["g", "9v6kpm"],
        ]),
      ],
      NOW,
    );
    expect(pin).toMatchObject({ id: "1", name: "Bitcoin & Coffee", startSec: NOW + 3600 });
    expect(pin.lat).toBeCloseTo(30.27, 1);
    expect(pin.lon).toBeCloseTo(-97.74, 1);
  });

  it("leaves out an event that's over, and one with no geohash", () => {
    const pins = eventPins(
      [
        ev("past", 31923, [
          ["title", "Done"],
          ["start", String(NOW - 7200)],
          ["end", String(NOW - 3600)],
          ["g", "9v6kpm"],
        ]),
        ev("nowhere", 31923, [
          ["title", "Somewhere"],
          ["start", String(NOW + 60)],
          ["location", "Austin TX"],
        ]),
      ],
      NOW,
    );
    expect(pins).toEqual([]);
  });

  it("soonest first", () => {
    const pins = eventPins(
      [
        ev("later", 31923, [
          ["title", "Later"],
          ["start", String(NOW + 9000)],
          ["g", "9v6kpm"],
        ]),
        ev("sooner", 31923, [
          ["title", "Sooner"],
          ["start", String(NOW + 60)],
          ["g", "9v6kpm"],
        ]),
      ],
      NOW,
    );
    expect(pins.map((p) => p.id)).toEqual(["sooner", "later"]);
  });
});
