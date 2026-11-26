// @vitest-environment node
/**
 * An addressable target's tagging `d` names the item, not only its author (Tapestry 2417b807):
 * `event-tag-<slug>-<author8>-<d16>-<hash8>-<asserter8>`. One asserter's taggings of two items by
 * the same author used to share a `d`, so the second replaced the first.
 */
import { describe, expect, it } from "vitest";
import { buildEventTaggingAssertion } from "@/lib/tagging-sdk/event-tagging/index.js";
import { hash8 } from "./tags";

const GH = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const ASSERTER = "2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331";
const TA = "82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833";

async function dOf(target: { address: string } | { id: string }, slug = "verified-human") {
  const h = "address" in target ? await hash8(target.address) : null;
  const built = buildEventTaggingAssertion({
    headerAuthorPubkey: ASSERTER,
    slug,
    target,
    polarity: 1,
    asserterPubkey: ASSERTER,
    taPubkeys: [TA],
    hash8: h === null ? undefined : () => h,
  });
  return built.tags.find((t) => t[0] === "d")![1];
}

describe("an addressable target's tagging d", () => {
  it("is the one Tapestry already published for the same tagging", async () => {
    expect(await dOf({ address: `39999:${GH}:vcavallo-1i6dn0p` })).toBe(
      "event-tag-verified-human-b83a28b7-vcavallo-1i6dn0p-086cb8ff-2efaa715",
    );
  });

  it("differs for two items by the same author", async () => {
    const a = await dOf({ address: `39999:${GH}:aburra16-io3q45` });
    const b = await dOf({ address: `39999:${GH}:wds4-t11b3n` });
    expect(a).not.toBe(b);
  });

  it("is unchanged for a note, named by id", async () => {
    expect(await dOf({ id: "d051d3b95d29513ec0446015a4133eadae00b50c8fbe8d02db2dde3132a6d043" }, "stoicism")).toBe(
      "event-tag-stoicism-d051d3b9-2efaa715",
    );
  });

  it("is not built at all without the hash, rather than one that collides", () => {
    expect(() =>
      buildEventTaggingAssertion({
        headerAuthorPubkey: ASSERTER,
        slug: "bot",
        target: { address: `39999:${GH}:x` },
        polarity: 1,
        asserterPubkey: ASSERTER,
        taPubkeys: [TA],
      }),
    ).toThrow(/hash8/);
  });
});
