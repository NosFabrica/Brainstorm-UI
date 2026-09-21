import { describe, expect, it } from "vitest";
import { uniqueRelays } from "./relays";

// A trailing slash or a capital letter is the same relay: publishing to both
// doubled every publish's connections (seen 2026-09-18 on a real account:
// 11 write relays that were 6).
describe("uniqueRelays", () => {
  it("counts a relay once, whatever its trailing slash or host case", () => {
    expect(
      uniqueRelays(["wss://relay.damus.io/", "wss://relay.damus.io", "wss://Nos.lol/", "wss://nos.lol", "wss://buzzbuild.communities.buzz.xyz"]),
    ).toEqual(["wss://relay.damus.io", "wss://nos.lol", "wss://buzzbuild.communities.buzz.xyz"]);
  });

  it("keeps a path, and skips blanks", () => {
    expect(uniqueRelays(["wss://relay.example/inbox/", "", "  ", "wss://relay.example/inbox"])).toEqual(["wss://relay.example/inbox"]);
  });
});
