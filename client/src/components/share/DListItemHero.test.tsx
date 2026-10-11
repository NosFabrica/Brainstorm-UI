/**
 * A GitHub account on its own page: the governing definition's fields, the
 * renderer's title and link, the undeclared tags folded away.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent, type ResolvedConcept } from "@/lib/conceptResolution";

const { COMMUNITY } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const TA = "2".repeat(64);

let concept: { data: ResolvedConcept | null; isPending: boolean } = { data: null, isPending: true };
vi.mock("@/hooks/useItemConcept", () => ({ useItemConcept: () => concept }));
const viewer = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ isAdmin: viewer.isAdmin }) }));
// The GitHub profile template, as published on dcosl (pinned by id).
const { TEMPLATE_ID } = vi.hoisted(() => ({
  TEMPLATE_ID: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
}));
vi.mock("@/hooks/useLinkTemplates", () => ({
  useLinkTemplates: () => ({
    data: new Map([
      [
        TEMPLATE_ID,
        { id: TEMPLATE_ID, pubkey: "2".repeat(64), name: "GitHub profile", template: "https://github.com/{username}" },
      ],
    ]),
  }),
}));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [COMMUNITY], rendered: [COMMUNITY], known: true }),
}));

// The app's players, as what they're handed: the test is what the page gives them.
// The rest of the list has its own tests (DListItemNeighbours.test).
vi.mock("@/components/dictionary/DListItemNeighbours", () => ({
  DListItemNeighbours: () => <div data-testid="neighbours-slot" />,
}));
vi.mock("@/components/share/EmbeddedTrackCard", () => ({
  EmbeddedTrackCard: (p: { audio?: string; title: string; artist?: string }) => (
    <div data-testid="track-card" data-audio={p.audio}>
      {p.title} — {p.artist}
    </div>
  ),
}));
vi.mock("@/components/share/FeedVideo", () => ({
  FeedVideo: (p: { src: string }) => <div data-testid="feed-video" data-src={p.src} />,
}));

import { DListItemHero } from "./DListItemHero";

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [
  ["description", "A list of github handles/accounts"],
  ["required", "github-username"],
  ["field-type", "github-username", "text"],
]);
const item = {
  id: "9".repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [
    ["d", "vcavallo-1i6dn0p"],
    ["z", COMMUNITY],
    ["description", "Vinney Cavallo"],
    ["github-username", "vcavallo"],
  ],
};

beforeEach(() => {
  concept = { data: resolveConcept({ community, communityCoordinate: COMMUNITY }), isPending: false };
  viewer.isAdmin = true;
});

describe("DListItemHero", () => {
  it("a GitHub account under a definition built the way it should be: clean, with its templated GitHub link", () => {
    // A copy shaped like the one Vinney publishes: the person's name as title, the
    // username beneath, the GitHub logo for the list, and the profile link built
    // from the GitHub URL template — no GitHub-specific code anywhere.
    const copy = header(TA, [
      ["required", "github-username"],
      ["field-type", "github-username", "text"],
      ["optional", "description", "Who it belongs to"],
      ["display", "title", "description"],
      ["display", "summary", "github-username"],
      ["image", "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"],
      ["link", TEMPLATE_ID, "wss://dcosl.brainstorm.world", "username", "github-username"],
      ["b", COMMUNITY, "pointer"],
    ]);
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy }),
      isPending: false,
    };
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-title")).toHaveTextContent("Vinney Cavallo");
    expect(screen.getByTestId("dlist-item-summary")).toHaveTextContent("vcavallo");
    expect(screen.getByTestId("dlist-item-list-image")).toBeInTheDocument();
    const link = screen.getByTestId("dlist-item-link");
    expect(link).toHaveAttribute("href", "https://github.com/vcavallo");
    expect(link).toHaveTextContent("GitHub profile");
    expect(link).toHaveTextContent("github.com");
    // Every field is shown by the title, summary or link: no table, no More fields.
    expect(screen.queryByTestId("dlist-item-fields")).toBeNull();
    expect(screen.queryByTestId("dlist-item-more-toggle")).toBeNull();
  });

  it("with no picture and no list image, a plain mark leads — and the page still closes on the rest of its list and its definition", () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-plain-mark")).toBeInTheDocument();
    expect(screen.queryByTestId("dlist-item-list-image")).toBeNull();
    const hero = screen.getByTestId("dlist-item-hero");
    const order = [...hero.querySelectorAll("[data-testid='neighbours-slot'], [data-testid='dlist-item-definition']")];
    expect(order.map((el) => el.getAttribute("data-testid"))).toEqual(["neighbours-slot", "dlist-item-definition"]);
    expect(screen.getByTestId("dlist-item-definition")).toHaveTextContent(
      "Shown as the community concept GitHub Accounts",
    );
  });

  it("a definition that names no URL template gives no link — there is no GitHub fallback", () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-title")).toHaveTextContent("vcavallo"); // the first required field
    expect(screen.queryByTestId("dlist-item-link")).toBeNull();
    expect(screen.getByText("GitHub Account")).toBeInTheDocument();
  });

  it("an admin can follow the concept's name to its Dictionary entry", () => {
    renderWithProviders(<DListItemHero event={item} />);
    const links = screen.getAllByRole("link", { name: "GitHub Accounts" });
    expect(links.length).toBeGreaterThan(0);
    for (const a of links)
      expect(a).toHaveAttribute("href", `/settings?tab=dictionary&concept=${encodeURIComponent(COMMUNITY)}`);
  });

  it("anyone else reads the concept's name as plain words: the Dictionary is admins-only for now", () => {
    viewer.isAdmin = false;
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-hero")).toHaveTextContent("Shown as the community concept GitHub Accounts.");
    expect(screen.queryByRole("link", { name: "GitHub Accounts" })).toBeNull();
  });

  it("folds tags outside the definition into More fields", async () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.queryByText("Vinney Cavallo")).toBeNull();
    const toggle = screen.getByTestId("dlist-item-more-toggle");
    expect(toggle).toHaveTextContent("More fields (1)");
    await userEvent.click(toggle);
    expect(screen.getByText("Not part of the GitHub Account definition")).toBeInTheDocument();
    expect(screen.getByTestId("dlist-item-extras")).toHaveTextContent("Vinney Cavallo");
  });

  it("folds a declared field nothing shows into More fields", async () => {
    const copy = header(TA, [
      ["required", "github-username"],
      ["optional", "location"],
      ["b", COMMUNITY, "pointer"],
    ]);
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy }),
      isPending: false,
    };
    renderWithProviders(
      <DListItemHero
        event={{ ...item, tags: [...item.tags.filter((t) => t[0] !== "description"), ["location", "NYC"]] }}
      />,
    );
    await userEvent.click(screen.getByTestId("dlist-item-more-toggle"));
    expect(screen.getByTestId("dlist-item-fields")).toHaveTextContent("location");
    expect(screen.getByTestId("dlist-item-fields")).not.toHaveTextContent("github-username");
  });

  it("draws from the reader's copy when it declares more — and says it differs", () => {
    const copy = header(TA, [
      ["description", "A list of github handles/accounts"],
      ["required", "github-username"],
      ["field-type", "github-username", "text"],
      ["optional", "description", "Who it belongs to"],
      ["b", COMMUNITY, "pointer"],
    ]);
    concept = {
      data: resolveConcept({ community, communityCoordinate: COMMUNITY, assistant: copy }),
      isPending: false,
    };
    renderWithProviders(<DListItemHero event={item} />);
    // The declared description is the summary: covered, so no More fields at all.
    expect(screen.getByTestId("dlist-item-summary")).toHaveTextContent("Vinney Cavallo");
    expect(screen.queryByTestId("dlist-item-more-toggle")).toBeNull();
    expect(screen.getByTestId("chip-dictionary-agreement")).toHaveTextContent("Differs from the community");
    expect(screen.getByText(/your Assistant's copy of/)).toBeInTheDocument();
  });

  it("flags a required field the item lacks", () => {
    renderWithProviders(<DListItemHero event={{ ...item, tags: [["z", COMMUNITY]] }} />);
    expect(screen.getByTestId("dlist-item-missing")).toHaveTextContent(
      "Missing github-username — the list requires it",
    );
  });

  it("with no definition, says so and shows what the item carries", () => {
    concept = { data: null, isPending: false };
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.getByTestId("dlist-item-hero")).toHaveAttribute("data-definition", "missing");
    expect(screen.getByText(/whose definition couldn.t be read/)).toBeInTheDocument();
    expect(screen.getByText("vcavallo")).toBeInTheDocument();
  });
});

describe("DListItemHero — media and an item's own link", () => {
  // A V4V song, under a definition that says which field plays and which links out.
  const songs = header(AVI, [
    ["required", "title"],
    ["optional", "artist"],
    ["optional", "url"],
    ["optional", "t", "Podcast Index page"],
    ["field-type", "url", "url"],
    ["field-type", "t", "url"],
    ["display", "title", "title"],
    ["display", "summary", "artist"],
    ["display", "link", "t"],
    ["display", "media", "url"],
  ]);
  const song = {
    ...item,
    tags: [
      ["z", COMMUNITY],
      ["title", "Supertramp"],
      ["artist", "Torcon 7"],
      ["url", "https://mp3s.podcastindex.org/Supertramp.mp3"],
      ["t", "https://podcastindex.org/podcast/4148683#5"],
    ],
  };

  it("plays an audio file in the track card, and links the item's own page", () => {
    concept = { data: resolveConcept({ community: songs, communityCoordinate: COMMUNITY }), isPending: false };
    renderWithProviders(<DListItemHero event={song} />);
    expect(screen.getByTestId("dlist-item-media")).toHaveAttribute("data-media-kind", "audio");
    expect(screen.getByTestId("track-card")).toHaveAttribute(
      "data-audio",
      "https://mp3s.podcastindex.org/Supertramp.mp3",
    );
    expect(screen.getByTestId("track-card")).toHaveTextContent("Supertramp — Torcon 7");
    const link = screen.getByTestId("dlist-item-link");
    expect(link).toHaveAttribute("href", "https://podcastindex.org/podcast/4148683#5");
    expect(link).toHaveTextContent("Podcast Index page");
    // title, artist, url and t are all shown: nothing left over.
    expect(screen.queryByTestId("dlist-item-more-toggle")).toBeNull();
  });

  it("plays a video file inline", () => {
    concept = { data: resolveConcept({ community: songs, communityCoordinate: COMMUNITY }), isPending: false };
    const clip = { ...song, tags: [...song.tags.filter((t) => t[0] !== "url"), ["url", "https://v.example/clip.mp4"]] };
    renderWithProviders(<DListItemHero event={clip} />);
    expect(screen.getByTestId("feed-video")).toHaveAttribute("data-src", "https://v.example/clip.mp4");
  });

  it("without a media role, nothing plays", () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.queryByTestId("dlist-item-media")).toBeNull();
  });
});

describe("DListItemHero — facts", () => {
  // A BTC Map import under a definition that lists a few of its fields as facts.
  const places = header(AVI, [
    ["required", "name"],
    ["optional", "phone"],
    ["optional", "accepts-bitcoin"],
    ["optional", "opening-hours"],
    ["display", "title", "name"],
    ["display", "fact", "phone"],
    ["display", "fact", "accepts-bitcoin", "Bitcoin"],
  ]);
  const place = {
    ...item,
    tags: [
      ["z", COMMUNITY],
      ["name", "Wolf's Burger Truck"],
      ["phone", "+1-540-391-0134"],
      ["accepts-bitcoin", "lightning"],
      ["opening-hours", "Mo-Fr 06:30-16:00"],
    ],
  };

  it("lists its facts as label and value, in the definition's order, and not again under More fields", async () => {
    concept = { data: resolveConcept({ community: places, communityCoordinate: COMMUNITY }), isPending: false };
    renderWithProviders(<DListItemHero event={place} />);
    const facts = screen.getAllByTestId("dlist-item-fact");
    expect(facts.map((f) => f.getAttribute("data-field"))).toEqual(["phone", "accepts-bitcoin"]);
    expect(facts[0]).toHaveTextContent("Phone+1-540-391-0134");
    expect(facts[1]).toHaveTextContent("Bitcoinlightning");
    // Only the field nothing shows waits behind More fields.
    await userEvent.click(screen.getByTestId("dlist-item-more-toggle"));
    expect(screen.getByTestId("dlist-item-fields")).toHaveTextContent("opening-hours");
    expect(screen.getByTestId("dlist-item-fields")).not.toHaveTextContent("phone");
  });

  it("without fact hints, no facts", () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.queryByTestId("dlist-item-facts")).toBeNull();
  });
});

describe("DListItemHero — location", () => {
  // A BTC Map import under a definition that maps its geohash.
  const places = header(AVI, [
    ["required", "name"],
    ["recommended", "g", "Geohash of the location"],
    ["display", "title", "name"],
    ["display", "location", "g"],
  ]);
  const place = {
    ...item,
    tags: [
      ["z", COMMUNITY],
      ["name", "La Tarantella - Recoleta"],
      ["g", "6ex01945p"],
      ["g", "6ex019"],
    ],
  };

  it("offers the map, and loads it only when asked", async () => {
    concept = { data: resolveConcept({ community: places, communityCoordinate: COMMUNITY }), isPending: false };
    renderWithProviders(<DListItemHero event={place} />);
    expect(screen.getByTestId("dlist-item-location")).toHaveAttribute("data-geohash", "6ex01945p");
    expect(screen.queryByTestId("dlist-item-map")).toBeNull();
    await userEvent.click(screen.getByTestId("dlist-item-map-show"));
    const map = screen.getByTestId("dlist-item-map");
    expect(map.getAttribute("src")).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
    expect(new URL(map.getAttribute("src")!).searchParams.get("marker")).toMatch(/^-25\.306\d+,-57\.587\d+$/);
    // The map shows g, and name is the title: nothing left over.
    expect(screen.queryByTestId("dlist-item-more-toggle")).toBeNull();
  });

  it("without a location role, no map", () => {
    renderWithProviders(<DListItemHero event={item} />);
    expect(screen.queryByTestId("dlist-item-location")).toBeNull();
  });
});
