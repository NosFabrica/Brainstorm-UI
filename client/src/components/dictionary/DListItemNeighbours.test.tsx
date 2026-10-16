// @vitest-environment jsdom
/**
 * Under a list item's page: who else in the reader's web of trust listed the
 * same thing, and what else the list holds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { resolveConcept, type HeaderEvent } from "@/lib/conceptResolution";

const { COMMUNITY } = vi.hoisted(() => ({
  COMMUNITY: "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts",
}));
const AVI = "b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450";
const BOB = "b".repeat(64);
const SPAM = "5".repeat(64);

const viewer = { isAdmin: false };
vi.mock("@/hooks/useActiveAccountDisplay", () => ({ useActiveAccountDisplay: () => ({ isAdmin: viewer.isAdmin }) }));
vi.mock("@/config/dictionary", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  dictionaryRelays: () => [],
}));
vi.mock("@/hooks/useDictionaryConcepts", () => ({
  useDictionaryConcepts: () => ({ shown: [COMMUNITY], rendered: [COMMUNITY], known: true }),
}));
vi.mock("@/hooks/useLinkTemplates", () => ({ useLinkTemplates: () => ({ data: new Map() }) }));
vi.mock("@/components/share/things/shared", () => ({
  useAuthors: (pks: string[]) =>
    new Map(pks.map((pk) => [pk, { pubkey: pk, npub: `npub-${pk.slice(0, 4)}`, name: `Name ${pk.slice(0, 4)}` }])),
}));

const account = (id: string, pubkey: string, username: string) => ({
  id: id.repeat(64),
  pubkey,
  kind: 39999,
  created_at: 1,
  content: "",
  tags: [
    ["d", `${username}-${id}`],
    ["z", COMMUNITY],
    ["github-username", username],
  ],
});
const mine = account("1", AVI, "vitorpamplona");
let listed = [mine];
vi.mock("@/hooks/useConceptItems", () => ({ useConceptItems: () => ({ data: listed }) }));
vi.mock("@/hooks/useWotItems", () => ({
  useWotItems: (items: { pubkey: string }[]) => ({
    trusted: items.filter((i) => i.pubkey !== SPAM),
    outside: items.filter((i) => i.pubkey === SPAM),
    pending: false,
  }),
}));

import { DListItemNeighbours } from "./DListItemNeighbours";

const community: HeaderEvent = {
  id: "c".repeat(64),
  pubkey: AVI,
  kind: 39998,
  created_at: 1,
  tags: [
    ["d", "github-accounts"],
    ["names", "GitHub Account", "GitHub Accounts"],
    ["required", "github-username"],
  ],
};
const resolved = resolveConcept({ community, communityCoordinate: COMMUNITY })!;

beforeEach(() => {
  viewer.isAdmin = false;
  listed = [
    mine,
    account("2", BOB, "vitorpamplona"),
    account("3", SPAM, "vitorpamplona"),
    account("4", AVI, "vcavallo"),
    account("5", SPAM, "beep-boop"),
    account("6", BOB, "aburra16"),
  ];
});

describe("DListItemNeighbours", () => {
  it("says who else in the reader's web of trust listed the same thing, and links to them", () => {
    render(<DListItemNeighbours event={mine} resolved={resolved} />);
    const also = screen.getByTestId("dlist-item-also-listed");
    expect(also).toHaveTextContent("Also listed by Name bbbb");
    expect(within(also).getByRole("link")).toHaveAttribute("href", "/p/npub-bbbb");
  });

  it("shows the list's other things from trusted listers, under the list's name", () => {
    render(<DListItemNeighbours event={mine} resolved={resolved} />);
    const more = screen.getByTestId("dlist-item-more-from-list");
    expect(more).toHaveTextContent("More GitHub Accounts");
    expect(
      within(more)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["vcavallo", "aburra16"]);
  });

  it("only an admin gets the way in to the whole list: the Dictionary is admins-only for now", () => {
    const { unmount } = render(<DListItemNeighbours event={mine} resolved={resolved} />);
    expect(screen.queryByTestId("dlist-item-see-all")).toBeNull();
    unmount();
    viewer.isAdmin = true;
    render(<DListItemNeighbours event={mine} resolved={resolved} />);
    expect(screen.getByTestId("dlist-item-see-all")).toHaveTextContent("See all 3");
  });

  it("is nothing at all for an item alone in its list", () => {
    listed = [mine];
    const { container } = render(<DListItemNeighbours event={mine} resolved={resolved} />);
    expect(container).toBeEmptyDOMElement();
  });
});
