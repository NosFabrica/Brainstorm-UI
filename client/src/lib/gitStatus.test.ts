/**
 * NIP-34 status events (kinds 1630–1633) say what became of an issue or a
 * patch. The newest wins; none at all means open. 1631 reads "merged" on a
 * patch and "resolved" on an issue — the same event, the right word.
 */
import { describe, expect, it } from "vitest";
import { gitStateOf, GIT_STATE_LABEL, gitAgentOf } from "./gitStatus";

describe("gitStateOf", () => {
  it("maps status kinds to states, with the right word for the item", () => {
    expect(gitStateOf(1630, 1621)).toBe("open");
    expect(gitStateOf(1631, 1617)).toBe("merged");
    expect(gitStateOf(1631, 1621)).toBe("resolved");
    expect(gitStateOf(1632, 1621)).toBe("closed");
    expect(gitStateOf(1633, 1617)).toBe("draft");
    expect(gitStateOf(1631, 1618)).toBe("merged"); // a pull request merges like a patch
  });
  it("no status event means open", () => {
    expect(gitStateOf(undefined, 1621)).toBe("open");
    expect(GIT_STATE_LABEL.open).toBe("Open");
    expect(GIT_STATE_LABEL.merged).toBe("Merged");
  });
});

describe("gitAgentOf", () => {
  it("names the agent that filed an issue, and nothing for a person", () => {
    expect(gitAgentOf({ tags: [["buzz-origin-agent", "Sentinel"], ["subject", "x"]] })).toBe("Sentinel");
    expect(gitAgentOf({ tags: [["buzz-origin-agent", ""]] })).toBe("agent");
    expect(gitAgentOf({ tags: [["subject", "x"]] })).toBeNull();
  });
  // Probed 2026-09-05: under the house lens no browse issue carried the tag,
  // but 37 of 100 came from "Yuki (Personal Agent)" (bot: true) and four from
  // "DanConwayDev's Agent". The author says it when the event does not.
  it("reads the author too: a bot flag, or agent or bot in the name", () => {
    const issue = { tags: [["subject", "x"]] };
    expect(gitAgentOf(issue, { name: "yuki", displayName: "Yuki (Personal Agent)", bot: true })).toBe("Yuki (Personal Agent)");
    expect(gitAgentOf(issue, { displayName: "DanConwayDev's Agent" })).toBe("DanConwayDev's Agent");
    expect(gitAgentOf(issue, { name: "buildbot" })).toBeNull(); // whole words only
    expect(gitAgentOf(issue, { name: "Derek Ross" })).toBeNull();
    expect(gitAgentOf(issue, null)).toBeNull();
  });
});
