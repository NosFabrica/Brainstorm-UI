/**
 * What an event's content IS before a row prints it. Kind-30078 app data
 * (Ditto, Armada, Nostr Mail settings) is NIP-44 ciphertext: a row printed
 * 300 characters of base64 as a snippet (Benjamin, 2026-09-23, kind:30078
 * on Everything). A row says what the content is instead.
 */
import { describe, expect, it } from "vitest";
import { contentShape } from "./contentShape";

const NIP44 = "AgkXT1NChTXAHiDpLZZwu5PO5rAVpAxTeRwbCyrcWYDpXson5eEnf/JjsvZqC+V/P5uTF4sbspmfOlVeCi8aJb/oceACXS4VBRcA6s3FxVx0AUbFFqpQGtWjw7a4fu51pNS+6NBCYMiMr/0Uta3xMKuyUbZH6KyFwc+0css9hv3Vf+";

describe("contentShape", () => {
  it("knows NIP-44 and NIP-04 ciphertext", () => {
    expect(contentShape(NIP44)).toEqual({ kind: "encrypted" });
    expect(contentShape("q2hlbGxvIHdvcmxk9fWkp+Q==?iv=ZmFrZWl2ZmFrZWl2ZmFrZWl2")).toEqual({ kind: "encrypted" });
  });

  it("knows structured data, and how big it is", () => {
    expect(contentShape('{"theme":"dark","lang":"en","relays":["wss://a"]}')).toEqual({ kind: "json", fields: 3 });
    expect(contentShape("[1,2,3]")).toEqual({ kind: "json", fields: 3 });
  });

  it("leaves prose, links, and short words as text; nothing as empty", () => {
    expect(contentShape("Records read time to sync notification status across devices.")).toEqual({ kind: "text" });
    expect(contentShape("gm https://example.com/a/very/long/path/that/has/no/spaces/but/is/a/url")).toEqual({ kind: "text" });
    expect(contentShape("dGVzdA==")).toEqual({ kind: "text" }); // too short to call ciphertext
    expect(contentShape("  ")).toEqual({ kind: "empty" });
  });
});
