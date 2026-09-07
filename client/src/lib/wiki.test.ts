// @vitest-environment node
/**
 * NIP-54 wiki articles (kind 30818) link to one another with [[wikilinks]].
 * GitCitadel Publishing mirrors Wikipedia this way: "*Isis* was a major
 * [[ancient Egyptian deities|goddess]]". Read on Brainstorm, a wikilink is a
 * search for that topic's articles here — people stay, and any author's page
 * on the topic can answer, not just one.
 */
import { describe, expect, it } from "vitest";
import { wikiToMarkdown } from "./wiki";

describe("wikiToMarkdown", () => {
  it("a labelled wikilink reads as its label and searches the topic's articles here", () => {
    expect(wikiToMarkdown("a [[ancient Egyptian deities|goddess]] of magic")).toBe("a [goddess](/?q=ancient%20Egyptian%20deities&t=articles) of magic");
  });
  it("a bare wikilink reads as the topic itself", () => {
    expect(wikiToMarkdown("see [[Osiris]] and [[Horus]]")).toBe("see [Osiris](/?q=Osiris&t=articles) and [Horus](/?q=Horus&t=articles)");
  });
  it("everything else passes through untouched", () => {
    const md = "*Isis* was a **goddess** — see [Wikipedia](https://en.wikipedia.org/wiki/Isis).";
    expect(wikiToMarkdown(md)).toBe(md);
  });
});
