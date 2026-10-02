/**
 * The provisional presentation hints: roles on declared fields, the list's
 * image, and how an item reads with and without them.
 */
import { describe, expect, it } from "vitest";
import { displayHintTags, parseDisplayHints, NO_HINTS } from "./displayHints";
import { parseFieldDecls } from "./dlistFields";
import { definitionOf, differencesBetween, type HeaderEvent } from "./conceptResolution";
import { presentItem } from "./itemPresentation";

const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const header = (tags: string[][]): HeaderEvent => ({
  id: "h".padEnd(64, "0"),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const fields = [
  ["required", "github-username"],
  ["optional", "description"],
  ["optional", "avatar"],
];
const item = {
  tags: [
    ["github-username", "vcavallo"],
    ["description", "Vinney Cavallo"],
    ["avatar", "https://avatars.example/v.png"],
  ],
};

describe("parseDisplayHints", () => {
  it("reads roles that name declared fields, and the list's image", () => {
    const h = header([
      ...fields,
      ["display", "title", "description"],
      ["display", "summary", "github-username"],
      ["display", "image", "avatar"],
      ["image", "https://github.githubassets.com/favicons/favicon.svg"],
    ]);
    expect(parseDisplayHints(h, parseFieldDecls(h))).toEqual({
      title: "description",
      summary: "github-username",
      image: "avatar",
      link: null,
      media: null,
      listImage: "https://github.githubassets.com/favicons/favicon.svg",
    });
  });

  it("ignores undeclared fields, unknown roles, later duplicates and non-http images", () => {
    const h = header([
      ...fields,
      ["display", "title", "ghost"],
      ["display", "banner", "description"],
      ["display", "summary", "description"],
      ["display", "summary", "github-username"],
      ["image", "javascript:alert(1)"],
    ]);
    expect(parseDisplayHints(h, parseFieldDecls(h))).toEqual({ ...NO_HINTS, summary: "description" });
  });

  it("writes roles in a fixed order, the image only when it's a URL", () => {
    expect(displayHintTags({ title: "a", summary: null, image: "b", listImage: "nope" })).toEqual([
      ["display", "title", "a"],
      ["display", "image", "b"],
    ]);
  });
});

describe("presentItem", () => {
  const plain = definitionOf(header(fields));
  const hinted = definitionOf(
    header([
      ...fields,
      ["display", "title", "description"],
      ["display", "image", "avatar"],
      ["image", "https://x.example/i.svg"],
    ]),
  );

  it("with no hints: the first required field is the title, a description the summary", () => {
    expect(presentItem(item, plain, true)).toMatchObject({
      title: "vcavallo",
      titleField: "github-username",
      summary: "Vinney Cavallo",
      image: null,
      listImage: null,
    });
  });

  it("a hint decides: the header's author has the say", () => {
    expect(presentItem(item, hinted, true)).toMatchObject({
      title: "Vinney Cavallo",
      image: "https://avatars.example/v.png",
      listImage: "https://x.example/i.svg",
    });
  });

  it("the summary is never the title again", () => {
    expect(presentItem(item, hinted, true).summary).toBeNull();
  });

  it("hints switched off: the defaults stand", () => {
    expect(presentItem(item, hinted, false)).toMatchObject({
      title: "vcavallo",
      image: null,
      listImage: null,
    });
  });
});

describe("a copy that changes the hints", () => {
  it("differs from the community in how its items read", () => {
    const community = definitionOf(header(fields));
    const copy = definitionOf(header([...fields, ["display", "title", "description"]]));
    expect(differencesBetween(copy, community)).toEqual(["display"]);
  });
});

describe("link and media roles", () => {
  // A V4V song as the curator files it, under a definition that names what each field is for.
  const songFields = [
    ["required", "title"],
    ["optional", "artist"],
    ["optional", "artwork"],
    ["optional", "url"],
    ["optional", "t", "Podcast Index page"],
    ["field-type", "url", "url"],
    ["field-type", "t", "url"],
  ];
  const song = {
    tags: [
      ["title", "Supertramp"],
      ["artist", "Torcon 7"],
      ["artwork", "https://feeds.example/cover.jpg"],
      ["url", "https://mp3s.podcastindex.org/Supertramp.mp3"],
      ["t", "https://podcastindex.org/podcast/4148683#5"],
    ],
  };
  const songs = definitionOf(
    header([
      ...songFields,
      ["display", "title", "title"],
      ["display", "summary", "artist"],
      ["display", "image", "artwork"],
      ["display", "link", "t"],
      ["display", "media", "url"],
    ]),
  );

  it("reads link and media like any other role", () => {
    expect(songs.display).toMatchObject({ link: "t", media: "url" });
  });

  it("the link is the item's own URL, named by its field's description", () => {
    expect(presentItem(song, songs, true).link).toEqual({
      href: "https://podcastindex.org/podcast/4148683#5",
      host: "podcastindex.org",
      label: "Podcast Index page",
    });
  });

  it("the media plays as what its file is", () => {
    expect(presentItem(song, songs, true).media).toEqual({
      url: "https://mp3s.podcastindex.org/Supertramp.mp3",
      kind: "audio",
    });
    const video = { tags: [...song.tags.filter((t) => t[0] !== "url"), ["url", "https://v.example/clip.mp4"]] };
    expect(presentItem(video, songs, true).media?.kind).toBe("video");
  });

  it("no media from a file that isn't audio or video, and no link from a non-http value", () => {
    const odd = {
      tags: [
        ["url", "https://example.com/page.html"],
        ["t", "javascript:alert(1)"],
      ],
    };
    expect(presentItem(odd, songs, true)).toMatchObject({ media: null, link: null });
  });

  it("a link labelled by its host when the field has no description", () => {
    const plain = definitionOf(
      header([
        ["optional", "page"],
        ["display", "link", "page"],
      ]),
    );
    expect(presentItem({ tags: [["page", "https://example.org/x"]] }, plain, true).link?.label).toBe("example.org");
  });
});
