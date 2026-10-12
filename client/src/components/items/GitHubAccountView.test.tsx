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
import { renderWithProviders } from "@/test/utils";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";
import { useResolvedItemView, isReady } from "@/hooks/useItemView";

const { COMMUNITY, TEMPLATE_ID } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
  TEMPLATE_ID: "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const HOUSE = "3".repeat(64);

const viewer = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ isAdmin: viewer.isAdmin }) }));
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
vi.mock("@/components/dictionary/DListItemNeighbours", () => ({
  DListItemNeighbours: () => <div data-testid="neighbours-slot" />,
}));
vi.mock("@/lib/connection", () => ({ useConnectionSpeed: () => "normal" }));

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
});

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
    const profile = screen.getByTestId("github-account-profile");
    expect(profile).toHaveAttribute("href", "https://github.com/nous-clawds4");
    expect(profile).toHaveTextContent("GitHub profile");
    expect(screen.getByTestId("github-account-repos")).toHaveAttribute(
      "href",
      "https://github.com/nous-clawds4?tab=repositories",
    );
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
});
