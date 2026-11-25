// @vitest-environment node
/**
 * Every "thing" kind — commerce, apps, git, communities, fundraisers, reviews,
 * collections and lists — through the readers its surfaces share: the shape a
 * quote draws it as (lib/embedShape), the All tab's row (lib/resultSummary) and
 * its label (lib/kindLabel, lib/kindFamily). None of them may fall to the generic
 * fallback — a quote of words, a row with no title or "Structured data", a
 * "Kind N" — and each says what the kind's spec says it is.
 *
 * The page, the quote card and the Top row are drawn from the same fixtures in
 * components/share/thingSurfaces.test.tsx.
 */
import { describe, expect, it } from "vitest";
import { THING_KIND_FIXTURES } from "@/test/thingKindFixtures";
import { embedShapeOf } from "./embedShape";
import { summarizeResult } from "./resultSummary";
import { kindLabel } from "./kindLabel";
import { kindFamily } from "./kindFamily";

describe.each(THING_KIND_FIXTURES)("$name", ({ event, shows, label }) => {
  const [title, ...facts] = shows;

  it("is quoted as its own card, never as words", () => {
    expect(embedShapeOf(event)).not.toBe("note");
  });

  it("is an All row with its title and its spec'd facts, never structured data", () => {
    const s = summarizeResult(event);
    expect(s.shape).toBeNull();
    const words = [s.title, s.body, ...s.facts].join(" · ");
    expect(s.title ?? s.body).toBeTruthy();
    expect(words).toContain(title);
    for (const fact of facts) expect(words).toContain(fact);
  });

  it(`is called a${/^[AEIOU]/.test(label) ? "n" : ""} ${label}, in a family`, () => {
    expect(kindLabel(event)).toBe(label);
    expect(kindFamily(event.kind)).not.toBeNull();
  });
});
