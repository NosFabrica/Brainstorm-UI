/**
 * One registry for what an event is called. Four copies disagreed (1618 was
 * "Issue" in one and "PR" in another), and every card said the kind its own
 * way. The team (2026-09-24): a spec from Nostr Hub has no NIP number, so the
 * kind's word is what tells a reader what they are looking at.
 */
import { describe, expect, it } from "vitest";
import { kindLabel, kindTypeLabel, specKindTags } from "./kindLabel";

const ev = (kind: number, tags: string[][] = []) => ({ id: "1".repeat(64), kind, pubkey: "a".repeat(64), tags, content: "", created_at: 1 });

describe("kindTypeLabel", () => {
  it("names the git kinds as NIP-34 does: patch, pull request, issue", () => {
    expect(kindTypeLabel(1617)).toBe("Patch");
    expect(kindTypeLabel(1618)).toBe("Pull request");
    expect(kindTypeLabel(1621)).toBe("Issue");
    expect(kindTypeLabel(30617)).toBe("Repo");
  });

  it("names the rest by what they are, a stream as a stream, an unknown kind by its number", () => {
    expect(kindTypeLabel(30817)).toBe("Spec");
    expect(kindTypeLabel(30818)).toBe("Wiki");
    expect(kindTypeLabel(30311)).toBe("Stream");
    expect(kindTypeLabel(0)).toBe("Person");
    expect(kindTypeLabel(12345)).toBe("Kind 12345");
  });
});

describe("kindLabel", () => {
  it("reads the event, so an article wearing zap.cooking's tag is a Recipe and a plain one an Article", () => {
    expect(kindLabel(ev(30023, [["d", "girik"], ["t", "zapcooking"]]))).toBe("Recipe");
    expect(kindLabel(ev(30023, [["d", "why"]]))).toBe("Article");
  });
});

describe("specKindTags", () => {
  it("lists the numeric k tags a spec carries, in order, each with the name its author gave", () => {
    expect(specKindTags(ev(30817, [["k", "7000"], ["k", "5905", "DVM Job Request"], ["k", "nip"], ["k", "5905"]]))).toEqual([
      { kind: "5905", label: "DVM Job Request" },
      { kind: "7000" },
    ]);
  });
});
