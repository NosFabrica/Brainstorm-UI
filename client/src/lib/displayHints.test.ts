/**
 * The provisional presentation hints: roles on declared fields, the list's
 * image, and how an item reads with and without them.
 */
import { describe, expect, it } from "vitest";
import { displayHintTags, factLabel, parseDisplayHints, NO_HINTS } from "./displayHints";
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
      location: null,
      facts: [],
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
    expect(displayHintTags({ ...NO_HINTS, title: "a", image: "b", listImage: "nope" })).toEqual([
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

describe("fact role", () => {
  // A BTC Map import, as Mise En Place files it, under a definition that lists a few of its fields.
  const placeFields = [
    ["required", "name"],
    ["recommended", "address"],
    ["optional", "phone"],
    ["optional", "opening-hours"],
    ["optional", "accepts-bitcoin"],
    ["optional", "menu"],
    ["field-type", "menu", "url"],
  ];
  const place = {
    tags: [
      ["name", "Wolf's Burger Truck"],
      ["address", "1440 Canal Street"],
      ["phone", "+1-540-391-0134"],
      ["opening-hours", "Mo-Fr 06:30-16:00"],
      ["accepts-bitcoin", "lightning"],
      ["menu", "https://wolfs.example/menu"],
    ],
  };
  const withFacts = (facts: string[][]) =>
    definitionOf(header([...placeFields, ["display", "title", "name"], ["display", "summary", "address"], ...facts]));

  it("repeats, in the header's order, each with its label or none; the first tag per field wins", () => {
    const h = header([
      ...placeFields,
      ["display", "fact", "phone"],
      ["display", "fact", "opening-hours", " Hours "],
      ["display", "fact", "phone", "Telephone"],
      ["display", "fact", "ghost"],
    ]);
    expect(parseDisplayHints(h, parseFieldDecls(h)).facts).toEqual([
      { field: "phone", label: null },
      { field: "opening-hours", label: "Hours" },
    ]);
  });

  it("reads a field's name as words when the header gives no label", () => {
    expect(factLabel({ field: "accepts-bitcoin", label: null })).toBe("Accepts bitcoin");
    expect(factLabel({ field: "postal_code", label: null })).toBe("Postal code");
    expect(factLabel({ field: "phone", label: "Call" })).toBe("Call");
  });

  it("writes facts after the roles, the label only when there is one", () => {
    expect(
      displayHintTags({
        ...NO_HINTS,
        title: "name",
        facts: [
          { field: "phone", label: null },
          { field: "opening-hours", label: "Hours" },
        ],
      }),
    ).toEqual([
      ["display", "title", "name"],
      ["display", "fact", "phone"],
      ["display", "fact", "opening-hours", "Hours"],
    ]);
  });

  it("a copy that adds, relabels or reorders a fact differs in how its items read", () => {
    const base = withFacts([["display", "fact", "phone"]]);
    expect(differencesBetween(withFacts([["display", "fact", "phone"]]), base)).toEqual([]);
    expect(differencesBetween(withFacts([["display", "fact", "phone", "Call"]]), base)).toEqual(["display"]);
    expect(
      differencesBetween(
        withFacts([
          ["display", "fact", "phone"],
          ["display", "fact", "menu"],
        ]),
        base,
      ),
    ).toEqual(["display"]);
  });

  it("an item lists the facts it has, labelled, its URL ones as links", () => {
    const shown = presentItem(
      { tags: place.tags.filter((t) => t[0] !== "opening-hours") },
      withFacts([
        ["display", "fact", "accepts-bitcoin", "Bitcoin"],
        ["display", "fact", "opening-hours"],
        ["display", "fact", "phone"],
        ["display", "fact", "menu"],
      ]),
      true,
    );
    expect(shown.facts).toEqual([
      { field: "accepts-bitcoin", label: "Bitcoin", value: "lightning", href: null, extra: 0 },
      { field: "phone", label: "Phone", value: "+1-540-391-0134", href: null, extra: 0 },
      {
        field: "menu",
        label: "Menu",
        value: "https://wolfs.example/menu",
        href: "https://wolfs.example/menu",
        extra: 0,
      },
    ]);
    expect(shown.factFields).toEqual(["accepts-bitcoin", "opening-hours", "phone", "menu"]);
  });

  it("never lists a field another role already shows", () => {
    const shown = presentItem(
      place,
      withFacts([
        ["display", "fact", "address"],
        ["display", "fact", "phone"],
      ]),
      true,
    );
    expect(shown.summary).toBe("1440 Canal Street");
    expect(shown.facts.map((f) => f.field)).toEqual(["phone"]);
    expect(shown.factFields).toEqual(["phone"]);
  });

  it("hints switched off: no facts", () => {
    expect(presentItem(place, withFacts([["display", "fact", "phone"]]), false).facts).toEqual([]);
  });
});

describe("location role", () => {
  // A BTC Map import, as Mise En Place files it: `g` once per precision, coarse to fine in any order.
  const placeFields = [
    ["required", "name"],
    ["recommended", "g", "Geohash of the location"],
  ];
  const place = {
    tags: [
      ["name", "La Tarantella - Recoleta"],
      ["g", "6ex019"],
      ["g", "6ex01945p"],
      ["g", "6ex0"],
    ],
  };
  const mapped = definitionOf(header([...placeFields, ["display", "location", "g"]]));

  it("reads the field's most precise geohash, wherever it sits", () => {
    const { location, locationField } = presentItem(place, mapped, true);
    expect(locationField).toBe("g");
    expect(location?.geohash).toBe("6ex01945p");
    expect(location?.lat).toBeCloseTo(-25.30647, 4);
    expect(location?.lon).toBeCloseTo(-57.58726, 4);
  });

  it("skips values that aren't geohashes, and is null when none is", () => {
    const odd = {
      tags: [
        ["name", "x"],
        ["g", "nope!"],
        ["g", "6ex0"],
      ],
    };
    expect(presentItem(odd, mapped, true).location?.geohash).toBe("6ex0");
    expect(
      presentItem(
        {
          tags: [
            ["name", "x"],
            ["g", "-25.3,-57.5"],
          ],
        },
        mapped,
        true,
      ).location,
    ).toBeNull();
  });

  it("needs the role: a declared g alone is no location", () => {
    expect(presentItem(place, definitionOf(header(placeFields)), true).location).toBeNull();
  });
});
