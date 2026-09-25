/**
 * Which NIP defines a kind — for the kinds fiatjaf's nips repo defines, and
 * only those. A spec published through Nostr Hub has no NIP number, and none
 * is ever invented (the team, 2026-09-24).
 */
import { describe, expect, it } from "vitest";
import { nipForKind } from "./kindNip";

describe("nipForKind", () => {
  it("names the NIP for the kinds the repo defines", () => {
    expect(nipForKind(1)).toBe("NIP-01");
    expect(nipForKind(30023)).toBe("NIP-23");
    expect(nipForKind(30402)).toBe("NIP-99");
    expect(nipForKind(10040)).toBe("NIP-85");
    expect(nipForKind(1618)).toBe("NIP-34");
  });

  it("names none for a kind the repo does not define — a hub spec, an app's own kind", () => {
    expect(nipForKind(30817)).toBeUndefined();
    expect(nipForKind(32267)).toBeUndefined();
    expect(nipForKind(12345)).toBeUndefined();
  });
});
