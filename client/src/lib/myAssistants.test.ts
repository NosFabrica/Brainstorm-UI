/**
 * Who the reader's Assistants are, from their own taggings: Tapestry's rule
 * (src/api/assistant/myAssistants.js), so both apps list the same people.
 */
import { describe, expect, it } from "vitest";
import { ASSISTANT_TAGS } from "@/config/assistants";
import { myAssistantRows, orderRows } from "./myAssistants";

const ME = "1".repeat(64);
const OTHER = "2".repeat(64);
const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const LOCAL = "c".repeat(64);
const [BRAINSTORM, TAPESTRY] = ASSISTANT_TAGS;

let seq = 0;
// A person tagging as both apps write it (lib/tagging-sdk/profile-tagging).
const tagging = (
  target: string,
  { slug = BRAINSTORM.slug, a = BRAINSTORM.coordinate as string | null, polarity = "1", by = ME, at = 100 } = {},
) => ({
  id: (++seq).toString(16).padStart(64, "0"),
  pubkey: by,
  kind: 39999,
  created_at: at,
  tags: [
    ["d", `profile-tag-${slug}-${target.slice(0, 8)}-${by.slice(0, 8)}`],
    ["p", target],
    ...(a ? [["a", a]] : []),
    ["polarity", polarity],
  ],
});

describe("myAssistantRows", () => {
  it("lists each profile the reader applied an Assistant tag to, with its tags in config order", () => {
    const rows = myAssistantRows({
      viewer: ME,
      local: null,
      taggings: [
        tagging(ALICE, { slug: TAPESTRY.slug, a: TAPESTRY.coordinate }),
        tagging(ALICE),
        tagging(BOB, { slug: TAPESTRY.slug, a: TAPESTRY.coordinate }),
      ],
    });
    expect(rows).toEqual(
      expect.arrayContaining([
        { pubkey: ALICE, local: false, tags: ["brainstorm", "tapestry"] },
        { pubkey: BOB, local: false, tags: ["tapestry"] },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("counts a tag by its slug, whoever authored the definition", () => {
    const rows = myAssistantRows({
      viewer: ME,
      local: null,
      taggings: [tagging(ALICE, { a: `39999:${OTHER}:${BRAINSTORM.slug}` })],
    });
    expect(rows).toEqual([{ pubkey: ALICE, local: false, tags: ["brainstorm"] }]);
  });

  it("falls back to the publisher's d, but only when it names the reader as signer", () => {
    expect(myAssistantRows({ viewer: ME, local: null, taggings: [tagging(ALICE, { a: null })] })).toHaveLength(1);
    const forged = tagging(ALICE, { a: null });
    forged.tags[0][1] = `profile-tag-${BRAINSTORM.slug}-${ALICE.slice(0, 8)}-${OTHER.slice(0, 8)}`;
    expect(myAssistantRows({ viewer: ME, local: null, taggings: [forged] })).toEqual([]);
  });

  it("ignores other tags and other people's taggings", () => {
    const rows = myAssistantRows({
      viewer: ME,
      local: null,
      taggings: [tagging(ALICE, { slug: "friend", a: `39999:${OTHER}:friend` }), tagging(BOB, { by: OTHER })],
    });
    expect(rows).toEqual([]);
  });

  it("lets the newest per tag and profile decide, and drops a dispute", () => {
    const withdrawn = [tagging(ALICE, { at: 100 }), tagging(ALICE, { polarity: "-1", at: 200 })];
    expect(myAssistantRows({ viewer: ME, local: null, taggings: withdrawn })).toEqual([]);
    const reapplied = [...withdrawn, tagging(ALICE, { at: 300 })];
    expect(myAssistantRows({ viewer: ME, local: null, taggings: reapplied })).toHaveLength(1);
  });

  it("reads a missing or unreadable polarity as apply", () => {
    const bare = tagging(ALICE);
    bare.tags = bare.tags.filter((t) => t[0] !== "polarity");
    expect(myAssistantRows({ viewer: ME, local: null, taggings: [bare] })).toHaveLength(1);
    expect(myAssistantRows({ viewer: ME, local: null, taggings: [tagging(BOB, { polarity: "yes" })] })).toHaveLength(1);
  });

  it("adds the local Assistant untagged when the reader hasn't tagged it, and marks it when they have", () => {
    expect(myAssistantRows({ viewer: ME, local: LOCAL, taggings: [] })).toEqual([
      { pubkey: LOCAL, local: true, tags: [] },
    ]);
    expect(myAssistantRows({ viewer: ME, local: LOCAL, taggings: [tagging(LOCAL)] })).toEqual([
      { pubkey: LOCAL, local: true, tags: ["brainstorm"] },
    ]);
  });
});

describe("orderRows", () => {
  it("puts the local row first, then sorts by name, case and accents aside", () => {
    const names: Record<string, string> = { [ALICE]: "émile", [BOB]: "Bea", [LOCAL]: "Zed" };
    const rows = [ALICE, BOB, LOCAL].map((pubkey) => ({ pubkey, local: pubkey === LOCAL }));
    expect(orderRows(rows, (pk) => names[pk]).map((r) => r.pubkey)).toEqual([LOCAL, BOB, ALICE]);
  });
});
