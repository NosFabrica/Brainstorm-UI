/**
 * When a note is a link result — the link is the point — and which words
 * the row then shows: the page's title leads, the note's own words describe
 * it when they add something, the page's description otherwise.
 */
import { describe, expect, it } from "vitest";
import { linkResultOf, linkResultText } from "./linkResult";

const URL = "https://www.eucup.com/1788652/";

describe("linkResultOf", () => {
  it("a bare link is a link result with no words of its own", () => {
    expect(linkResultOf(URL)).toMatchObject({
      url: URL,
      domain: "eucup.com",
      headline: null,
      words: "",
      imageUrl: null,
    });
  });

  it("a short lead and the link at the end is a link result; the words stay, the URL leaves them", () => {
    const r = linkResultOf(`Worth a read ${URL}`);
    expect(r).toMatchObject({ url: URL, words: "Worth a read", headline: null });
  });

  it("the link at the start with a short comment after it counts too", () => {
    expect(linkResultOf(`${URL} this one is good`)?.words).toBe("this one is good");
  });

  it("prose with a link in the middle is a note, not a link result", () => {
    expect(linkResultOf(`I keep thinking about ${URL} and what it means for the club this season`)).toBeNull();
  });

  it("a long post that happens to end with a link stays a note", () => {
    const long = "word ".repeat(40).trim();
    expect(linkResultOf(`${long} ${URL}`)).toBeNull();
  });

  it("a news-shaped note — headline, link, description — is a link result with a headline", () => {
    const r = linkResultOf(
      `Everton fan group 'standing down' after talks with the club ${URL} The 1878s have issued a statement. https://cdn.example/photo.jpg`,
      { feedAccount: true },
    );
    expect(r).toMatchObject({
      url: URL,
      headline: "Everton fan group 'standing down' after talks with the club",
      words: "The 1878s have issued a statement.",
      imageUrl: "https://cdn.example/photo.jpg",
    });
  });

  it("a picture beside the link is the thumbnail, not the link", () => {
    const r = linkResultOf(`https://cdn.example/pic.png ${URL}`);
    expect(r).toMatchObject({ url: URL, imageUrl: "https://cdn.example/pic.png", words: "" });
  });
});

describe("linkResultText", () => {
  const link = { url: URL, domain: "eucup.com", headline: null, words: "", imageUrl: null };
  const page = { title: "Review – The Archers Live at 75", description: "A night at the Philharmonic Hall." };

  it("leads with the page's title and describes with the page when the note said nothing", () => {
    expect(linkResultText(link, page)).toEqual({ title: page.title, description: page.description });
  });

  it("the note's own words describe it when they add something", () => {
    expect(linkResultText({ ...link, words: "Best gig of the year" }, page)).toEqual({
      title: page.title,
      description: "Best gig of the year",
    });
  });

  it("words that only repeat the title give way to the page's description", () => {
    expect(linkResultText({ ...link, words: "Review – The Archers Live at 75" }, page).description).toBe(
      page.description,
    );
  });

  it("a note headline is the title until the page answers, then the page's title leads", () => {
    const shaped = {
      ...link,
      headline: "Everton fan group standing down",
      words: "The 1878s have issued a statement.",
    };
    expect(linkResultText(shaped, null)).toEqual({
      title: "Everton fan group standing down",
      description: "The 1878s have issued a statement.",
    });
    expect(
      linkResultText(shaped, { title: "Everton fan group 'standing down' – Liverpool Echo", description: "x" }),
    ).toEqual({
      title: "Everton fan group 'standing down' – Liverpool Echo",
      description: "The 1878s have issued a statement.",
    });
  });

  it("nothing known yet: no title, the note's words if any", () => {
    expect(linkResultText(link, null)).toEqual({ title: null, description: null });
    expect(linkResultText({ ...link, words: "Worth a read" }, null)).toEqual({
      title: null,
      description: "Worth a read",
    });
  });
});
