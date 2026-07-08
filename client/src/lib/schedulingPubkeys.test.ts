import { describe, it, expect } from "vitest";
import { parsePubkeys } from "./schedulingPubkeys";

const HEX = "a".repeat(64);
const JACK_NPUB = "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m";

describe("parsePubkeys", () => {
  it("accepts a 64-char hex pubkey", () => {
    expect(parsePubkeys(HEX)).toEqual({ valid: [HEX], invalidCount: 0 });
  });

  it("decodes an npub to hex", () => {
    const { valid, invalidCount } = parsePubkeys(JACK_NPUB);
    expect(invalidCount).toBe(0);
    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("splits on whitespace and commas and dedupes", () => {
    const { valid } = parsePubkeys(`${HEX}, ${HEX}\n${JACK_NPUB}`);
    expect(valid).toHaveLength(2); // duplicate hex collapsed
  });

  it("counts invalid tokens and ignores blanks", () => {
    const { valid, invalidCount } = parsePubkeys("garbage   not-a-key\n\n");
    expect(valid).toEqual([]);
    expect(invalidCount).toBe(2);
  });
});
