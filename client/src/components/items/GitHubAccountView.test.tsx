// @vitest-environment jsdom
/**
 * A GitHub account on its own page, the tier-three way: the handle leads,
 * with the account's own avatar and a byline, and the GitHub buttons the
 * definition's templates build. Still the governing definition's fields —
 * the view only decides how they look (ADR 0007).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { nip19 } from "nostr-tools";
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";
import { useResolvedItemView, isReady } from "@/hooks/useItemView";

const { COMMUNITY, TEMPLATE_ID } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
  TEMPLATE_ID: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const HOUSE = "3".repeat(64);

const viewer = vi.hoisted(() => ({ isAdmin: false, pubkey: null as string | null }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => (viewer.pubkey ? { isAdmin: viewer.isAdmin, pubkey: viewer.pubkey } : null),
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
// The rest of the list (components/dictionary/DListItemNeighbours): who else listed the same handle.
const neighbours = vi.hoisted(() => ({ alsoListedBy: [] as string[] }));
vi.mock("@/components/dictionary/DListItemNeighbours", () => ({
  DListItemNeighbours: () => <div data-testid="neighbours-slot" />,
  useItemNeighbours: () => ({ alsoListedBy: neighbours.alsoListedBy, more: [], total: 1, coordinate: null }),
}));
vi.mock("@/lib/connection", () => ({ useConnectionSpeed: () => "normal" }));
// What the network says about the item (hooks/useItemEngagement); nothing unless a test says so.
const network = vi.hoisted(() => ({
  endorsers: [] as { pubkey: string; at: number }[],
  claimants: [] as { pubkey: string; proof: string | null }[],
}));
const endorse = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
// How far the lister is from the reader (hooks/useItemEngagement useListerDistance).
const distance = vi.hoisted(() => ({ hops: null as number | null }));
vi.mock("@/hooks/useItemEngagement", () => ({
  useItemEngagement: () => ({ endorsers: network.endorsers, claimants: network.claimants, pending: false }),
  useEndorseItem: () => endorse,
  useListerDistance: () => ({ hops: distance.hops }),
}));
const TRUSTED = "a".repeat(64);
const FOLLOWED = "b".repeat(64);
const STRANGER = "c".repeat(64);
// Who is in the reader's web of trust (hooks/useWotItems): only TRUSTED.
vi.mock("@/hooks/useWotItems", () => ({
  useWotItems: (items: { pubkey: string }[]) => ({
    trusted: items.filter((i) => i.pubkey === TRUSTED),
    outside: items.filter((i) => i.pubkey !== TRUSTED),
    pending: false,
    source: "house",
    observer: "house",
  }),
}));
vi.mock("@/hooks/useMyFollows", () => ({
  useMyFollows: () => ({ follows: new Set([FOLLOWED]), ready: true, signedIn: true }),
}));
vi.mock("@/hooks/useAuthorScores", () => ({
  useAuthorScores: () => (pk: string) => (pk === TRUSTED ? 0.5 : pk === FOLLOWED ? 0.1 : null),
}));
vi.mock("@/hooks/useProfileMap", () => ({
  useProfileMap: (pks: string[]) =>
    new Map(
      pks.map((pk) => [
        pk,
        {
          pubkey: pk,
          npub: `npub-${pk.slice(0, 1)}`,
          displayName: { a: "Ada", b: "Bob", c: "Cy" }[pk[0]] ?? pk.slice(0, 8),
        },
      ]),
    ),
}));
// What our origin knows from GitHub (services/github); nothing unless a test says so.
const github = vi.hoisted(() => ({ facts: null as null | Record<string, unknown>, pending: false }));
vi.mock("@/hooks/useGitHubAccount", () => ({
  useGitHubAccount: () => ({ data: github.facts, isPending: github.pending }),
}));

import { GitHubAccountView, githubAccountOf } from "./GitHubAccountView";

const header = (pubkey: string, tags: string[][]): HeaderEvent => ({
  id: pubkey.slice(0, 8).padEnd(64, "0"),
  pubkey,
  kind: 39998,
  created_at: 1,
  tags: [["d", "github-accounts"], ["names", "GitHub Account", "GitHub Accounts"], ...tags],
});
const community = header(AVI, [
  ["required", "github-username"],
  ["field-type", "github-username", "text"],
]);
// The house copy as published on staging today: the description is the title.
const houseCopy = header(HOUSE, [
  ["required", "github-username"],
  ["field-type", "github-username", "text"],
  ["optional", "description"],
  ["display", "title", "description"],
  ["display", "summary", "github-username"],
  ["image", "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"],
  ["link", TEMPLATE_ID, "wss://dcosl.brainstorm.world", "username", "github-username"],
  ["b", COMMUNITY, "pointer"],
]);
const item = {
  id: "9".repeat(64),
  pubkey: AVI,
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [
    ["d", "nous-clawds4-1vk793p"],
    ["z", COMMUNITY],
    ["description", "David's tapestry r&d agent"],
    ["github-username", "nous-clawds4"],
    ["homepage", "https://example.com"],
  ],
};

function Page({ event, copy }: { event: typeof item; copy?: HeaderEvent | null }) {
  const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house: copy });
  const view = useResolvedItemView(event, resolved);
  if (!isReady(view)) return <p>not ready</p>;
  return <GitHubAccountView event={event} view={view} />;
}

beforeEach(() => {
  viewer.isAdmin = false;
  viewer.pubkey = null;
  endorse.mutate.mockClear();
  endorse.isPending = false;
  github.facts = null;
  github.pending = false;
  network.endorsers = [];
  network.claimants = [];
  distance.hops = null;
  neighbours.alsoListedBy = [];
});

const FACTS = {
  handle: "nous-clawds4",
  name: "Nous Clawds",
  bio: "Tapestry's R&D agent",
  company: "@nous-clawds4",
  location: "Earth",
  blog: null,
  avatar: "https://avatars.githubusercontent.com/u/9?v=4",
  followers: 1200,
  publicRepos: 42,
  joinedAt: "2026-03-04T00:00:00Z",
  lastActiveAt: "2026-10-10T12:00:00Z",
  repos: [
    {
      name: "tapestry",
      url: "https://github.com/nous-clawds4/tapestry",
      description: "Trust, as a protocol",
      stars: 30,
      language: "JavaScript",
      pushedAt: "2026-10-01T00:00:00Z",
      fork: false,
    },
    {
      name: "dotfiles",
      url: "https://github.com/nous-clawds4/dotfiles",
      description: null,
      stars: 2,
      language: "Shell",
      pushedAt: "2026-09-01T00:00:00Z",
      fork: false,
    },
    {
      name: "nostr-tools",
      url: "https://github.com/nous-clawds4/nostr-tools",
      description: "a fork",
      stars: 900,
      language: "TypeScript",
      pushedAt: "2026-09-20T00:00:00Z",
      fork: true,
    },
    {
      name: "brainstorm",
      url: "https://github.com/nous-clawds4/brainstorm",
      description: "WoT",
      stars: 30,
      language: "TypeScript",
      pushedAt: "2026-10-05T00:00:00Z",
      fork: false,
    },
    {
      name: "fourth",
      url: "https://github.com/nous-clawds4/fourth",
      description: null,
      stars: 1,
      language: null,
      pushedAt: "2026-01-01T00:00:00Z",
      fork: false,
    },
  ],
};

describe("GitHubAccountView", () => {
  it("leads with the handle, the account's avatar and the byline, whatever the copy calls its title", () => {
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.getByTestId("github-account-handle")).toHaveTextContent("nous-clawds4");
    expect(screen.getByTestId("github-account-byline")).toHaveTextContent("David's tapestry r&d agent");
    const avatar = screen.getByTestId("github-account-avatar");
    expect(avatar.getAttribute("src")).toContain("github.com/nous-clawds4.png");
    expect(screen.getByText("GitHub Account")).toBeInTheDocument();
  });

  it("offers the profile the definition's template builds, and the repositories beside it", () => {
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    // Icon buttons, side by side: each is named for a screen reader and on hover.
    const profile = screen.getByRole("link", { name: "GitHub profile" });
    expect(profile).toHaveAttribute("href", "https://github.com/nous-clawds4");
    expect(profile).toHaveAttribute("title", "GitHub profile");
    const repos = screen.getByRole("link", { name: "Repositories on GitHub" });
    expect(repos).toHaveAttribute("href", "https://github.com/nous-clawds4?tab=repositories");
    expect(repos).toHaveAttribute("title", "Repositories on GitHub");
  });

  it("a definition that names no template gives no buttons — the view adds no link of its own", () => {
    renderWithProviders(<Page event={item} copy={null} />);
    expect(screen.getByTestId("github-account-handle")).toHaveTextContent("nous-clawds4");
    expect(screen.queryByTestId("github-account-profile")).toBeNull();
    expect(screen.queryByTestId("github-account-repos")).toBeNull();
  });

  it("a reader sees no definition line and no More fields; an admin sees both", async () => {
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.queryByTestId("dlist-item-definition")).toBeNull();
    expect(screen.queryByTestId("dlist-item-more-toggle")).toBeNull();
    expect(screen.getByTestId("neighbours-slot")).toBeInTheDocument();

    viewer.isAdmin = true;
    viewer.pubkey = TRUSTED;
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.getByTestId("dlist-item-definition")).toHaveTextContent(
      "Shown as Brainstorm's copy of GitHub Accounts",
    );
    const toggle = screen.getByTestId("dlist-item-more-toggle");
    expect(toggle).toHaveTextContent("More fields (1)");
    await userEvent.click(toggle);
    expect(within(screen.getByTestId("dlist-item-extras")).getByText("homepage")).toBeInTheDocument();
  });

  it("applies only when the governing definition declares the handle and the item carries it", () => {
    const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY, house: houseCopy })!;
    expect(githubAccountOf(item, resolved.governing)?.handle).toBe("nous-clawds4");
    const noHandle = { ...item, tags: item.tags.filter((t) => t[0] !== "github-username") };
    expect(githubAccountOf(noHandle, resolved.governing)).toBeNull();
    const renamed = resolveConcept({
      community,
      communityCoordinate: COMMUNITY,
      house: header(HOUSE, [
        ["required", "handle"],
        ["b", COMMUNITY, "pointer"],
      ]),
    })!;
    expect(githubAccountOf(item, renamed.governing)).toBeNull();
  });

  it("with GitHub's facts: the name leads, the handle and bio follow, then followers, repos and activity, then the best repos", () => {
    github.facts = FACTS;
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Nous Clawds");
    expect(screen.getByTestId("github-account-handle")).toHaveTextContent("nous-clawds4");
    expect(screen.getByTestId("github-account-bio")).toHaveTextContent("Tapestry's R&D agent");
    expect(screen.getByTestId("github-account-byline")).toHaveTextContent("David's tapestry r&d agent");
    const stats = screen.getByTestId("github-account-stats");
    expect(stats).toHaveTextContent("1.2k followers");
    expect(stats).toHaveTextContent("42 repos");
    expect(stats).toHaveTextContent("Active");
    expect(stats).toHaveTextContent("Joined 2026");
    expect(stats).toHaveTextContent("Earth");
    // The account's own work, by stars then last push, three at most; the fork is left out.
    const repos = screen.getAllByTestId("github-account-repo");
    expect(repos.map((r) => within(r).getByRole("link").textContent)).toEqual(["brainstorm", "tapestry", "dotfiles"]);
    expect(within(repos[0]).getByRole("link")).toHaveAttribute("href", "https://github.com/nous-clawds4/brainstorm");
    expect(repos[0]).toHaveTextContent("30");
    expect(repos[0]).toHaveTextContent("TypeScript");
    expect(repos[1]).toHaveTextContent("Trust, as a protocol");
  });

  it("an account GitHub doesn't know, or hasn't answered about yet, keeps the page as the list describes it", () => {
    github.pending = true;
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("nous-clawds4");
    expect(screen.queryByTestId("github-account-stats")).toBeNull();
    expect(screen.queryByTestId("github-account-repo")).toBeNull();
  });

  it("says who endorsed the listing, the people the reader follows first, each face a link", () => {
    network.endorsers = [
      { pubkey: TRUSTED, at: 9 },
      { pubkey: FOLLOWED, at: 8 },
      { pubkey: STRANGER, at: 7 },
    ];
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const line = screen.getByTestId("github-account-endorsed");
    expect(line).toHaveTextContent("Endorsed by Bob, Ada and Cy");
    const faces = [...line.querySelectorAll("[data-face]")].map((el) => el.getAttribute("data-face"));
    expect(faces).toEqual([FOLLOWED, TRUSTED, STRANGER]);
    expect(within(line).getAllByRole("link")[0]).toHaveAttribute("href", `/p/${nip19.npubEncode(FOLLOWED)}`);
  });

  it("lists the Nostr profiles in the reader's network that claim this handle, and nobody else", () => {
    network.claimants = [
      { pubkey: STRANGER, proof: null },
      { pubkey: TRUSTED, proof: "gist" },
      { pubkey: FOLLOWED, proof: null },
    ];
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const section = screen.getByTestId("github-account-claimants");
    const rows = within(section).getAllByTestId("github-account-claimant");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Ada");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/p/npub-a");
    expect(rows[0]).toHaveTextContent("says this GitHub account is theirs");
    expect(rows[0]).toHaveTextContent("In your network");
    // Strangers' claims are neither listed nor counted.
    expect(section).not.toHaveTextContent("2");
    expect(screen.queryByTestId("github-account-claimants-outside")).toBeNull();
  });

  it("with no endorsements and no claimants, neither block shows", () => {
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.queryByTestId("github-account-endorsed")).toBeNull();
    expect(screen.queryByTestId("github-account-claimants")).toBeNull();
  });

  it("when only strangers claim the handle, the page says nothing about them", () => {
    network.claimants = [
      { pubkey: STRANGER, proof: null },
      { pubkey: FOLLOWED, proof: null },
    ];
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.queryByTestId("github-account-claimants")).toBeNull();
    expect(screen.queryByTestId("github-account-claimants-outside")).toBeNull();
  });

  it("a signed-in reader can endorse the listing; one who already has sees that they did; a visitor sees no button", async () => {
    network.endorsers = [{ pubkey: TRUSTED, at: 9 }];
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.queryByTestId("github-account-endorse")).toBeNull();

    viewer.pubkey = FOLLOWED;
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const button = screen.getByTestId("github-account-endorse");
    expect(button).toHaveTextContent("Endorse");
    await userEvent.click(button);
    expect(endorse.mutate).toHaveBeenCalledTimes(1);

    viewer.pubkey = TRUSTED;
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const done = screen.getAllByTestId("github-account-endorse").at(-1)!;
    expect(done).toHaveTextContent("Endorsed");
    expect(done).toBeDisabled();
  });

  it("with no endorsements yet, a signed-in reader is invited to be the first", () => {
    viewer.pubkey = FOLLOWED;
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    expect(screen.getByTestId("github-account-endorse")).toHaveTextContent("Endorse");
    expect(screen.getByText("Be the first to endorse this account.")).toBeInTheDocument();
  });

  it("sums the page up under the name: who listed it and how far they are, and how many in the reader's network vouch", () => {
    // A reader who hasn't endorsed it themselves, two hops from the lister; Ada listed the handle too.
    viewer.pubkey = "d".repeat(64);
    distance.hops = 2;
    neighbours.alsoListedBy = [TRUSTED];
    network.endorsers = [
      { pubkey: TRUSTED, at: 9 },
      { pubkey: FOLLOWED, at: 8 },
      { pubkey: STRANGER, at: 7 },
    ];
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const verdict = screen.getByTestId("github-account-verdict");
    // The lister is the item's author: AVI, "Bob" in this test's profiles.
    expect(verdict).toHaveTextContent("Listed by Bob and Ada · 2 hops from you");
    expect(within(verdict).getByRole("link", { name: "Bob" })).toHaveAttribute("href", "/p/npub-b");
    expect(within(verdict).getByRole("link", { name: "Ada" })).toHaveAttribute("href", "/p/npub-a");
    expect(verdict).toHaveTextContent("2 people in your network vouch for this account.");
  });

  it("for a visitor the verdict names the lister and says nobody vouches yet; a single hop reads as one", () => {
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const verdict = screen.getByTestId("github-account-verdict");
    expect(verdict).toHaveTextContent("Listed by Bob");
    expect(verdict).not.toHaveTextContent("hops");
    expect(verdict).toHaveTextContent("No one in your network vouches for this account yet.");

    viewer.pubkey = TRUSTED;
    distance.hops = 1;
    network.endorsers = [{ pubkey: TRUSTED, at: 9 }];
    renderWithProviders(<Page event={item} copy={houseCopy} />);
    const mine = screen.getAllByTestId("github-account-verdict").at(-1)!;
    expect(mine).toHaveTextContent("Listed by Bob · 1 hop from you");
    expect(mine).toHaveTextContent("You vouch for this account.");
  });
});
