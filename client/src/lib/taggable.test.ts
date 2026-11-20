// @vitest-environment node
import { describe, expect, it } from "vitest";
import { taggableDetail, taggableImage, taggableTitle, taggableType } from "./taggable";

/**
 * What a tagged thing is called. Tagging used to know two words: a person, and
 * "a post" for everything else, so an issue's page offered "Tag this post" and
 * Your tags listed a repo as "a post" (2026-11-20). The thing's own kind says
 * what it is, through the registry every card already uses (lib/kindLabel);
 * a Dictionary list's item is what its list calls it.
 */
const PK = "a".repeat(64);
const ev = (kind: number, tags: string[][] = []) => ({
  kind,
  tags,
  pubkey: PK,
  id: "1".repeat(64),
  content: "",
  created_at: 1,
});

describe("taggableType", () => {
  // The section a thing is filed under is the search filter it is found under, in the filter's
  // own word (2026-11-20: an app handler sat under "App handlers" beside a filter called "Apps").
  // The noun stays the thing's own word, the one its card and its page already say.
  it.each([
    [1, "post", "Posts"],
    [1111, "post", "Posts"],
    [9802, "highlight", "Posts"],
    [30617, "repo", "Repos"],
    [1621, "issue", "Issues"],
    [1618, "pull request", "PRs"],
    [1617, "patch", "PRs"],
    [30023, "article", "Articles"],
    [30818, "wiki", "Articles"],
    [30817, "spec", "NIPs"],
    [34550, "community", "Communities"],
    [40, "channel", "Communities"],
    [9041, "zap goal", "Fundraisers"],
    [33863, "fundraiser", "Fundraisers"],
    [32267, "app", "Apps"],
    [31990, "app handler", "Apps"],
    [35128, "website", "Apps"],
    [30311, "stream", "Live"],
    [36787, "track", "Music"],
    [31923, "event", "Events"],
    [34259, "rating", "Reviews"],
    [31987, "relay review", "Reviews"],
    [39089, "starter pack", "Lists"],
    [30402, "listing", "Shop"],
    [21, "video", "Media"],
  ])("kind %i is a %s, filed under %s", (kind, noun, plural) => {
    expect(taggableType(ev(kind))).toMatchObject({ noun, plural });
  });

  it("files every kind a filter holds in one section, counted in the filter's word", () => {
    const handler = taggableType(ev(31990));
    const app = taggableType(ev(32267));
    expect(handler.key).toBe(app.key);
    expect(handler.counted).toEqual({ one: "app", many: "apps" });
    expect(taggableType(ev(1617)).counted).toEqual({ one: "PR", many: "PRs" });
    expect(taggableType(ev(36787)).counted).toEqual({ one: "track", many: "tracks" });
    // And keeps what the thing itself is called, for the row that names it.
    expect(handler.label).toBe("App handler");
    expect(app.label).toBe("App");
  });

  it("gives a kind no filter holds a section of its own", () => {
    expect(taggableType(ev(30063))).toMatchObject({
      noun: "release",
      plural: "Releases",
      label: "Release",
      counted: { one: "release", many: "releases" },
    });
  });

  it("calls an article published as a recipe a recipe", () => {
    const recipe = ev(30023, [
      ["d", "chili"],
      ["t", "zapcooking"],
    ]);
    expect(taggableType(recipe)).toMatchObject({ noun: "recipe", plural: "Recipes" });
  });

  it("calls a Dictionary list's item what its list calls it, keeping a name cased on purpose", () => {
    const item = ev(39999, [["d", "octocat"]]);
    // Headed as the filter menu writes it: "GitHub accounts".
    expect(taggableType(item, { singular: "GitHub Account", plural: "GitHub Accounts" })).toMatchObject({
      noun: "GitHub account",
      plural: "GitHub accounts",
      label: "GitHub Account",
      counted: { one: "GitHub account", many: "GitHub accounts" },
    });
    expect(taggableType(item, { singular: "Food and Drink Place", plural: "Food and Drink Places" }).plural).toBe(
      "Food and drink places",
    );
  });

  // An Event Index event is a list's item; a calendar event is a kind. Both are found under the
  // Events filter, and Your tags had two sections called "Events" (2026-11-20).
  it("files a list's items with the filter of the same name", () => {
    const listed = taggableType(ev(39999, [["d", "sprint"]]), { singular: "Event", plural: "Events" });
    const native = taggableType(ev(31923));
    expect(listed.key).toBe(native.key);
    expect(listed).toMatchObject({ noun: "event", label: "Event", plural: "Events" });
    expect(listed.counted).toEqual({ one: "event", many: "events" });
    // A list no filter is named for keeps a section of its own.
    expect(taggableType(ev(39999), { singular: "Book", plural: "Books" }).key).not.toBe(native.key);
  });

  // The Places filter is the community's "Food and Drink Places" list and every copy of it
  // (hooks/useTaggedItems names the filter): a tagged cafe is filed under Places, as it is found.
  it("files a list's item under the filter that list has, in the filter's name", () => {
    const cafe = taggableType(ev(39999, [["d", "cafe"]]), {
      singular: "Food and Drink Place",
      plural: "Food and Drink Places",
      section: "Places",
    });
    expect(cafe).toMatchObject({ noun: "food and drink place", label: "Food and Drink Place", plural: "Places" });
    // Whatever a copy of the list calls itself, its items are in the one section.
    const other = taggableType(ev(39999, [["d", "bar"]]), { singular: "Venue", plural: "Venues", section: "Places" });
    expect(other.key).toBe(cafe.key);
    expect(other.plural).toBe("Places");
  });

  it("gives every type a key of its own, the same for the same type", () => {
    const keys = [ev(1621), ev(30617), ev(1), ev(11)].map((e) => taggableType(e).key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[2]).toBe(keys[3]);
    expect(taggableType(ev(39999), { singular: "Book", plural: "Books" }).key).not.toBe(
      taggableType(ev(39999), { singular: "Place", plural: "Places" }).key,
    );
  });

  it("calls a kind with no name an item, never a post it isn't", () => {
    expect(taggableType(ev(30405))).toMatchObject({ noun: "item", plural: "Other items" });
    // A list item whose list hasn't been read yet is an item too, not a "List item item".
    expect(taggableType(ev(39999))).toMatchObject({ noun: "item", plural: "Other items" });
  });
});

describe("taggableTitle — what a tagged thing is called in a list", () => {
  const withContent = (kind: number, content: string, tags: string[][] = []) => ({ ...ev(kind, tags), content });

  it("uses the name the thing gives itself: a title, a name, an issue's subject", () => {
    expect(taggableTitle(ev(30023, [["title", "Zap week"]]))).toBe("Zap week");
    expect(
      taggableTitle(
        ev(30617, [
          ["d", "amethyst"],
          ["name", "Amethyst"],
        ]),
      ),
    ).toBe("Amethyst");
    expect(taggableTitle(ev(1621, [["subject", "Crash on startup"]]))).toBe("Crash on startup");
  });

  // Several kinds keep their name in JSON content (an app handler, a channel, a stall): the
  // first version showed the JSON itself as the title.
  it("reads the name out of a thing that keeps it in JSON", () => {
    const handler = withContent(31990, '{"name": "Garden & Growth", "picture": "https://example.com/a.png"}', [
      ["d", "garden"],
    ]);
    expect(taggableTitle(handler)).toBe("Garden & Growth");
    // And never shows JSON it can't read a name from.
    expect(taggableTitle(withContent(1, '{"x": 1}'))).toBeNull();
  });

  it("uses a post's first line, cut at a word when it runs long", () => {
    expect(taggableTitle(withContent(1, "Swing dancing tonight\n\nDoors at eight."))).toBe("Swing dancing tonight");
    const long = taggableTitle(withContent(1, "word ".repeat(40)))!;
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("has nothing to say for a thing with no words of its own", () => {
    expect(taggableTitle(withContent(1, "   "))).toBeNull();
    expect(taggableTitle(withContent(1, "https://example.com/video.mp4"))).toBeNull();
  });
});

describe("taggableImage — the picture a tagged thing is shown with in a list", () => {
  const withContent = (kind: number, content: string, tags: string[][] = []) => ({ ...ev(kind, tags), content });

  it("uses the picture the thing names for itself", () => {
    expect(taggableImage(ev(30023, [["image", "https://example.com/cover.jpg"]]))).toBe(
      "https://example.com/cover.jpg",
    );
    expect(taggableImage(ev(30311, [["thumb", "https://example.com/t.jpg"]]))).toBe("https://example.com/t.jpg");
    expect(taggableImage(ev(32267, [["icon", "https://example.com/icon.png"]]))).toBe("https://example.com/icon.png");
  });

  it("reads it out of a thing that keeps its details in JSON", () => {
    const handler = withContent(31990, '{"name": "Garden & Growth", "picture": "https://example.com/a.png"}');
    expect(taggableImage(handler)).toBe("https://example.com/a.png");
  });

  it("uses a post's first picture", () => {
    const post = withContent(1, "Swing night\nhttps://example.com/dance.jpg\nhttps://example.com/two.png");
    expect(taggableImage(post)).toBe("https://example.com/dance.jpg");
  });

  it("uses a video's poster, never the video file", () => {
    const video = ev(21, [
      ["title", "Sound check"],
      ["imeta", "url https://example.com/clip.mp4", "m video/mp4", "image https://example.com/poster.jpg"],
    ]);
    expect(taggableImage(video)).toBe("https://example.com/poster.jpg");
    // With no poster there is nothing to show: a video file is not a picture.
    expect(taggableImage(ev(21, [["imeta", "url https://example.com/clip.mp4", "m video/mp4"]]))).toBeNull();
  });

  it("uses the first of a product's pictures", () => {
    const product = withContent(
      30018,
      '{"name": "Honey", "images": ["https://example.com/jar.jpg", "https://example.com/label.jpg"]}',
    );
    expect(taggableImage(product)).toBe("https://example.com/jar.jpg");
  });

  it("has none for a thing with no picture, and never takes one that isn't a web address", () => {
    expect(taggableImage(withContent(1, "Just words."))).toBeNull();
    expect(taggableImage(ev(30023, [["image", "javascript:alert(1)"]]))).toBeNull();
  });
});

describe("taggableDetail — the one thing worth saying about a thing beside its name", () => {
  it("says when a calendar event is", () => {
    const meetup = ev(31923, [
      ["d", "meetup"],
      ["start", "1797076800"],
    ]);
    expect(taggableDetail(meetup)).toMatch(/2026/);
    // A whole-day event has a date and no hour.
    const day = taggableDetail(ev(31922, [["start", "2026-12-12"]]))!;
    expect(day).toMatch(/2026/);
    expect(day).not.toMatch(/\d:\d\d/);
  });

  it("has nothing of its own to add for a post or a repo, or an event with no date", () => {
    expect(taggableDetail(ev(1))).toBeNull();
    expect(taggableDetail(ev(30617))).toBeNull();
    expect(taggableDetail(ev(31923))).toBeNull();
  });
});
