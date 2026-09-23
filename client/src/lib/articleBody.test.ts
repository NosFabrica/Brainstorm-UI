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
    expect(prepareArticleBody(own, "Something else")).toEqual({ body: own, status: [] });
    expect(prepareArticleBody("`draft` is a word in a sentence.", "T").status).toEqual([]);
  });
});
