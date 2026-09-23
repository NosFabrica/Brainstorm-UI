/**
 * What the reader shows of a spec's Markdown, and what it lifts out of it.
 *
 * NIPs — as kind-30817 specs and as the kind-30818 wiki mirrors of them —
 * open with their own `# Title` (the page already shows the title) and then a
 * line of backticked status words, `` `draft` `optional` ``, which is
 * metadata dressed as code. Benjamin (2026-09-23): the page showed the title
 * twice and the status as raw backticks.
 */
import { describe, expect, it } from "vitest";
import { prepareArticleBody } from "./articleBody";

const NIP = "# NIP-21\n\n## `nostr:` URI scheme\n\n`draft` `optional`\n\nThis NIP standardizes the usage of a common URI scheme.\n\nThe scheme is `nostr:`.";

describe("prepareArticleBody", () => {
  it("drops the leading heading when it repeats the title, and lifts the status words out", () => {
    const { body, status } = prepareArticleBody(NIP, "NIP-21");

    expect(status).toEqual(["draft", "optional"]);
    expect(body.startsWith("## `nostr:` URI scheme")).toBe(true);
    expect(body).not.toContain("`draft`");
    expect(body).toContain("The scheme is `nostr:`."); // ordinary inline code stays
  });

  it("matches the title loosely — case and stray spaces don't count", () => {
    expect(prepareArticleBody("#  nip-21  \n\nBody.", "NIP-21").body).toBe("Body.");
  });

  it("leaves a body alone when its heading is its own, and when there is no status line", () => {
    const own = "# Why Bitcoin\n\nA short case.";
    expect(prepareArticleBody(own, "Something else")).toMatchObject({ body: own, status: [], kinds: [], tags: [] });
    expect(prepareArticleBody("`draft` is a word in a sentence.", "T").status).toEqual([]);
  });
});

/**
 * A spec's front matter, the way authors actually write it (Trust Service
 * Machines, kind 30817, 2026-03): an underlined title, then the spec's own id,
 * its status, and `kind`/`tag` lines that name what it defines — all as
 * backticked tokens, then a rule. That is the spec's details, not its prose.
 */
const TSM = [
  "Trust Service Machines (TSM)",
  "===",
  "",
  "`tsm-trust-service-machines`",
  "",
  "`draft`",
  "",
  "`kind` `37570` \"TSM Service Announcement\"",
  "",
  "`kind` `37571` \"TSM Output Standard\"",
  "",
  "`tag` `n` \"nip reference\"",
  "",
  "`tag` `B` \"price in millisats\"",
  "",
  "---",
  "",
  "Nostr needs an interoperable standard for requesting web-of-trust computation.",
].join("\n");

describe("prepareArticleBody — a spec's details", () => {
  it("reads an underlined title as the title, even with a stray space in the tag", () => {
    const { body } = prepareArticleBody(TSM, "Trust Service Machines (TSM )", { identifier: "tsm-trust-service-machines" });
    expect(body.startsWith("Nostr needs")).toBe(true);
  });

  it("lifts the id, the status, and the kinds and tags it defines, out of the prose", () => {
    const { body, status, kinds, tags } = prepareArticleBody(TSM, "Trust Service Machines (TSM )", { identifier: "tsm-trust-service-machines" });

    expect(status).toEqual(["draft"]);
    expect(kinds).toEqual([{ kind: "37570", label: "TSM Service Announcement" }, { kind: "37571", label: "TSM Output Standard" }]);
    expect(tags).toEqual([{ name: "n", label: "nip reference" }, { name: "B", label: "price in millisats" }]);
    expect(body).not.toContain("tsm-trust-service-machines");
    expect(body).not.toContain("`kind`");
    expect(body).not.toMatch(/^---/m); // the rule that closed the front matter goes with it
  });

  // An unnumbered NIP (klabo's AI Agent Communication, seen 2026-09-23)
  // opens `# NIP-XX`, then its name as a subtitle, then the status line. The
  // placeholder heading is the author's and stays; the status is still the
  // spec's details.
  it("lifts the status from under an author's own opening heading", () => {
    const { status, body } = prepareArticleBody("# NIP-XX\n\n## AI Agent Messages\n\n`draft` `optional`\n\nThis NIP defines a protocol.", "AI Agent Communication");
    expect(status).toEqual(["draft", "optional"]);
    expect(body).toBe("# NIP-XX\n\n## AI Agent Messages\n\nThis NIP defines a protocol.");
  });

  it("only a known status word is a status — an unknown backticked token stays in the prose", () => {
    const { status, body } = prepareArticleBody("# T\n\n`hello-world`\n\nProse.", "T");
    expect(status).toEqual([]);
    expect(body).toContain("`hello-world`");
  });
});
