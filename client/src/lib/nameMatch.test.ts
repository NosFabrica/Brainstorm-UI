import { describe, expect, it } from "vitest";
import { nameMatchScore } from "./nameMatch";

// Live, searching "nova": the Top result was "Freddy Donovan" — the letters sat
// inside a word. A name matches by words: the whole name, or every word typed
// starting a word of the name.
describe("nameMatchScore — names match by words, never inside one", () => {
  it("scores the exact name highest, a word-start match next, and nothing inside a word", () => {
    expect(nameMatchScore("NOVA", "nova")).toBe(2);
    expect(nameMatchScore("NOVA MOB", "nova")).toBe(1);
    expect(nameMatchScore("Ivan Nova", "nova")).toBe(1);
    expect(nameMatchScore("Freddy Donovan", "nova")).toBe(0);
    expect(nameMatchScore("Ainsley Costello", "ainsley cos")).toBe(1);
    expect(nameMatchScore("Ainsley Costello", "costello ainsley")).toBe(1);
    expect(nameMatchScore("Ainsley Costello", "ain")).toBe(1);
    expect(nameMatchScore("Ainsley Costello", "ai")).toBe(0);
  });
});
