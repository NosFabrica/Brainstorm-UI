import { describe, expect, it } from "vitest";
import { firstValueFrom, of } from "rxjs";
import { withSearchToken } from "./relayPool";
import { CONTENT_RELAYS, PROFILE_RELAYS, SEARCH_RELAY } from "./relays";

describe("our search relay as a fallback", () => {
  it("is in every read fallback set", () => {
    expect(SEARCH_RELAY).toBe("wss://search.brainstorm.world/");
    expect(PROFILE_RELAYS).toContain(SEARCH_RELAY);
    expect(CONTENT_RELAYS).toContain(SEARCH_RELAY);
  });

  it("adds the whole-corpus search token to plain reads, and leaves real searches alone", async () => {
    expect(withSearchToken({ kinds: [10050], authors: ["a"] })).toEqual({
      kinds: [10050],
      authors: ["a"],
      search: "include:spam",
    });
    expect(withSearchToken([{ kinds: [0] }, { kinds: [0], search: "observer:abc vitor" }])).toEqual([
      { kinds: [0], search: "include:spam" },
      { kinds: [0], search: "observer:abc vitor" },
    ]);
    expect(await firstValueFrom(withSearchToken(of([{ kinds: [3] }])) as never)).toEqual([
      { kinds: [3], search: "include:spam" },
    ]);
  });
});
