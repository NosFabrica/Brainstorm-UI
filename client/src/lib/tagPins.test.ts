import { describe, it, expect } from "vitest";
import {
  buildTagPin,
  conceptTagPinning,
  defaultCurationMethod,
  pinDTag,
  tagElementAddr,
  tagRefFromPin,
} from "./tagPins";

/**
 * The SDK ships no pin builder, so these tests ARE the spec check — every
 * assertion below is transcribed from `core/protocol/tags.md` §Pins rather than
 * from our implementation. If the kit later ships a builder, diff against it
 * before deleting any of this.
 */

const AUTHOR = "a".repeat(64);
const VIEWER = "b".repeat(64);
const ELEMENT_ID = "c".repeat(64);
const TA_CANON = "d".repeat(64);
const TA_LOCAL = "e".repeat(64);

const pin = () =>
  buildTagPin({
    slug: "verified-human",
    tagAuthorPubkey: AUTHOR,
    tagEventId: ELEMENT_ID,
    viewerPubkey: VIEWER,
    taPubkeys: [TA_CANON, TA_LOCAL],
  });

const tagValue = (ev: { tags: string[][] }, name: string) =>
  ev.tags.find((t) => t[0] === name)?.[1];

describe("buildTagPin — wire shape", () => {
  it("is a kind-39999 DList item like every other tag event", () => {
    expect(pin().kind).toBe(39999);
  });

  it("uses the spec's deterministic d-tag, 8-char prefixes and all", () => {
    // tag-pin-<tagSlug>-<tagAuthorPubkey[0:8]>-<viewerPubkey[0:8]>
    expect(tagValue(pin(), "d")).toBe("tag-pin-verified-human-aaaaaaaa-bbbbbbbb");
  });

  it("carries BOTH references — e for the version, a for the identity", () => {
    // The dual reference is the spec's deliberate choice: `e` pins the version
    // seen at pin-time, `a` tracks the tag through the author's later edits.
    const p = pin();
    expect(tagValue(p, "e")).toBe(ELEMENT_ID);
    expect(tagValue(p, "a")).toBe(`39999:${AUTHOR}:verified-human`);
  });

  it("stamps every honored namespace with the tag-pinning concept", () => {
    const zs = pin().tags.filter((t) => t[0] === "z").map((t) => t[1]);
    expect(zs).toEqual([
      `39998:${TA_CANON}:tag-pinning`,
      `39998:${TA_LOCAL}:tag-pinning`,
    ]);
  });

  it("carries curation-method as STRINGIFIED json, not an object", () => {
    const raw = tagValue(pin(), "curation-method")!;
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw)).toEqual({
      observer: VIEWER,
      method: "nip85:rank",
      cutoff: 1,
      includeScoreInTL: true,
    });
  });

  it("mirrors the key fields in content, as the family does", () => {
    const parsed = JSON.parse(pin().content);
    expect(parsed.tagPinning.tagEventId).toBe(ELEMENT_ID);
    expect(parsed.tagPinning.curationMethod.observer).toBe(VIEWER);
  });

  it("honours a caller-supplied curation method", () => {
    // "Further method identifiers may be introduced by convention" — so the
    // default must not be hardcoded past the caller.
    const custom = { observer: VIEWER, method: "manual", cutoff: 5, includeScoreInTL: false };
    const p = buildTagPin({
      slug: "author",
      tagAuthorPubkey: AUTHOR,
      tagEventId: ELEMENT_ID,
      viewerPubkey: VIEWER,
      taPubkeys: [TA_CANON],
      curationMethod: custom,
    });
    expect(JSON.parse(tagValue(p, "curation-method")!)).toEqual(custom);
  });
});

describe("buildTagPin — refuses to mint junk", () => {
  const base = {
    slug: "author",
    tagAuthorPubkey: AUTHOR,
    tagEventId: ELEMENT_ID,
    viewerPubkey: VIEWER,
    taPubkeys: [TA_CANON],
  };

  it("rejects a malformed tag author", () => {
    // These become permanent signed coordinates under the user's real key.
    expect(() => buildTagPin({ ...base, tagAuthorPubkey: "nope" })).toThrow(/tagAuthorPubkey/);
  });

  it("rejects a malformed viewer pubkey", () => {
    expect(() => buildTagPin({ ...base, viewerPubkey: "" })).toThrow(/viewerPubkey/);
  });

  it("rejects a malformed element id", () => {
    expect(() => buildTagPin({ ...base, tagEventId: "abc" })).toThrow(/tagEventId/);
  });

  it("rejects an empty slug", () => {
    expect(() => buildTagPin({ ...base, slug: "" })).toThrow(/slug/);
  });

  it("rejects a missing namespace list", () => {
    expect(() => buildTagPin({ ...base, taPubkeys: [] })).toThrow(/taPubkeys/);
  });
});

describe("tagRefFromPin", () => {
  it("reads the tag back off the stable address", () => {
    expect(tagRefFromPin(pin())).toEqual({ authorPubkey: AUTHOR, slug: "verified-human" });
  });

  it("keeps slugs containing hyphens intact", () => {
    const p = buildTagPin({
      slug: "aos-2026-participant",
      tagAuthorPubkey: AUTHOR,
      tagEventId: ELEMENT_ID,
      viewerPubkey: VIEWER,
      taPubkeys: [TA_CANON],
    });
    expect(tagRefFromPin(p)?.slug).toBe("aos-2026-participant");
  });

  it("returns null rather than guessing when there is no address", () => {
    // An `e` alone doesn't name a tag without another fetch, so we don't pretend.
    expect(tagRefFromPin({ tags: [["e", ELEMENT_ID]] })).toBeNull();
  });

  it("returns null for a malformed address", () => {
    expect(tagRefFromPin({ tags: [["a", "39999:not-hex:author"]] })).toBeNull();
  });
});

describe("helpers", () => {
  it("composes the tag-pinning handle on the documented family shape", () => {
    // NOTE: our reading, not an SDK constant — worksheet W1 is open on this.
    expect(conceptTagPinning(TA_CANON)).toBe(`39998:${TA_CANON}:tag-pinning`);
  });

  it("composes the tag-element address", () => {
    expect(tagElementAddr(AUTHOR, "author")).toBe(`39999:${AUTHOR}:author`);
  });

  it("scopes the pin d-tag to BOTH the tag and the viewer", () => {
    // Two viewers pinning the same tag must not collide; nor must one viewer
    // pinning two same-slug tags from different authors.
    expect(pinDTag("x", AUTHOR, VIEWER)).not.toBe(pinDTag("x", VIEWER, VIEWER));
    expect(pinDTag("x", AUTHOR, VIEWER)).not.toBe(pinDTag("x", AUTHOR, AUTHOR));
  });

  it("defaults the observer to the viewer", () => {
    expect(defaultCurationMethod(VIEWER).observer).toBe(VIEWER);
  });
});
