// @vitest-environment node
/**
 * One hashtag and nothing else is a topic, and goes to its page. The one
 * exception is the tag restored Vines carry as a label: the topic page asks
 * notes and articles by `#t`, which no Vine has, so it showed nothing.
 */
import { describe, expect, it } from "vitest";
import { parseTopicQuery, topicPath } from "./topicQuery";

describe("parseTopicQuery", () => {
  it("one hashtag is a topic", () => {
    expect(parseTopicQuery("#nostr")).toEqual({ isTopic: true, tag: "nostr" });
    expect(topicPath("nostr")).toBe("/t/nostr");
  });

  it("a hyphenated hashtag still goes to its topic page, hyphen dropped", () => {
    expect(parseTopicQuery("#bitcoin-art")).toEqual({ isTopic: true, tag: "bitcoinart" });
    expect(parseTopicQuery("#vine-compilation")).toEqual({ isTopic: true, tag: "vinecompilation" });
  });

  it("`#vine-archive` is a search, the Media tab's Classic Vines, not a topic", () => {
    expect(parseTopicQuery("#vine-archive")).toEqual({ isTopic: false, tag: "" });
    expect(parseTopicQuery(" #Vine-Archive ")).toEqual({ isTopic: false, tag: "" });
  });

  it("a tag with words beside it was never a topic", () => {
    expect(parseTopicQuery("#nostr bitcoin")).toEqual({ isTopic: false, tag: "" });
  });
});
