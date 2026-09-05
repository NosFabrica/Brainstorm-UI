/**
 * NIP-34 status events (kinds 1630–1633) say what became of an issue or a
 * patch. The newest wins; none at all means open. 1631 reads "merged" on a
 * patch and "resolved" on an issue — the same event, the right word.
 */
import { describe, expect, it } from "vitest";
import { gitStateOf, GIT_STATE_LABEL } from "./gitStatus";

describe("gitStateOf", () => {
  it("maps status kinds to states, with the right word for the item", () => {
    expect(gitStateOf(1630, 1621)).toBe("open");
    expect(gitStateOf(1631, 1617)).toBe("merged");
    expect(gitStateOf(1631, 1621)).toBe("resolved");
    expect(gitStateOf(1632, 1621)).toBe("closed");
    expect(gitStateOf(1633, 1617)).toBe("draft");
  });
  it("no status event means open", () => {
    expect(gitStateOf(undefined, 1621)).toBe("open");
    expect(GIT_STATE_LABEL.open).toBe("Open");
    expect(GIT_STATE_LABEL.merged).toBe("Merged");
  });
});
