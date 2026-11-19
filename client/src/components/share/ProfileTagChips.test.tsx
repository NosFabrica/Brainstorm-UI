/**
 * "Tagged as" — the network's tags on a person, and the way to add one. The
 * same row a post has (NoteTagChips): label, chips, then the dashed "Tag this
 * profile" button, so tagging reads as one thing wherever it is. The button was
 * once a quiet "+ Tag" beside the hashtags (2026-09-08); it came back here when
 * tagging was unified (2026-11-19).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfileTagChips } from "./ProfileTagChips";

let tags: unknown[] = [];
let phone = false;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => phone }));
vi.mock("@/hooks/useTags", () => ({ useProfileTags: () => ({ data: { tags } }) }));
vi.mock("@/components/share/TagPersonButton", () => ({
  TagPersonButton: ({ isOwner, legacyRoles }: { isOwner?: boolean; legacyRoles?: string[] }) => (
    <button data-testid="share-add-tag" data-owner={String(!!isOwner)} data-legacy={(legacyRoles ?? []).join(",")}>
      Tag this profile
    </button>
  ),
}));

const PK = "a".repeat(64);
const tag = (name: string) => ({
  key: name,
  name,
  slug: name.toLowerCase(),
  authorPubkey: "b".repeat(64),
  counted: true,
  selfDeclared: false,
  subjectDisagreed: false,
  myStance: null,
  applications: 3,
  description: "",
});

describe("ProfileTagChips", () => {
  it("with no tags and no way to add one, there is no row", () => {
    tags = [];
    render(<ProfileTagChips pubkey={PK} />);
    expect(screen.queryByTestId("share-tags")).toBeNull();
    expect(screen.queryByTestId("share-add-tag")).toBeNull();
  });

  it("with no tags, someone who can tag gets the label and the button, as on a post", () => {
    tags = [];
    render(<ProfileTagChips pubkey={PK} canTag />);
    const row = screen.getByTestId("share-tags");
    expect(row).toHaveTextContent("Tagged as");
    expect(screen.getByTestId("share-add-tag")).toHaveTextContent("Tag this profile");
  });

  it("with tags: the label, the chips, then the button", () => {
    tags = [tag("Musician"), tag("Builder")];
    render(<ProfileTagChips pubkey={PK} canTag />);
    const row = screen.getByTestId("share-tags");
    expect(row).toHaveTextContent("Tagged as");
    expect(row).not.toHaveTextContent("Known for");
    const chips = screen.getAllByTestId("share-tag-chip");
    expect(chips).toHaveLength(2);
    const button = screen.getByTestId("share-add-tag");
    expect(chips.at(-1)!.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("someone who can't tag sees the chips and no button", () => {
    tags = [tag("Musician")];
    render(<ProfileTagChips pubkey={PK} />);
    expect(screen.getAllByTestId("share-tag-chip")).toHaveLength(1);
    expect(screen.queryByTestId("share-add-tag")).toBeNull();
  });

  it("hands the button who is looking and what they listed before", () => {
    tags = [];
    render(<ProfileTagChips pubkey={PK} canTag isOwner legacyRoles={["Builder"]} />);
    const button = screen.getByTestId("share-add-tag");
    expect(button).toHaveAttribute("data-owner", "true");
    expect(button).toHaveAttribute("data-legacy", "Builder");
  });

  it("the owner still gets Manage beside their tags", () => {
    tags = [tag("Musician")];
    render(<ProfileTagChips pubkey={PK} canTag isOwner />);
    expect(screen.getByTestId("share-tags-manage")).toHaveAttribute("href", "/tags/mine");
  });

  it("a tag still on its way to the relays looks like it, and says so", () => {
    tags = [{ ...tag("Ham Radio"), pending: true }];
    render(<ProfileTagChips pubkey={PK} canTag />);
    const chip = screen.getByTestId("share-tag-chip");
    expect(chip).toHaveAttribute("data-pending", "true");
    expect(chip.getAttribute("title")).toMatch(/publishing/i);
  });

  // Your own tag, from an account the trust filter doesn't count yet: it shows for you and
  // nobody else. The tag's page says so (TaggedNotes); the chip says the same, in place of a
  // count of nobody.
  it("says a tag only you added is shown to you alone", () => {
    tags = [{ ...tag("Dancer"), applications: 0, counted: false, myStance: "apply" }];
    render(<ProfileTagChips pubkey={PK} canTag />);
    const title = screen.getByTestId("share-tag-chip").getAttribute("title")!;
    expect(title).toMatch(/^Only you can see this for now\./);
    expect(title).toContain("once your account has a trust score");
    expect(title).not.toMatch(/0 people/);
  });

  it("says nothing of the kind about a tag other people's votes carry", () => {
    tags = [{ ...tag("Dancer"), myStance: "apply" }];
    render(<ProfileTagChips pubkey={PK} canTag />);
    expect(screen.getByTestId("share-tag-chip").getAttribute("title")).not.toMatch(/only you/i);
  });
});

// A profile can collect a dozen tags, and the row sits in the identity block above the
// bio's facts. It shows the best-supported few (the service sorts them that way) and puts
// the rest one press away, in place: nothing is hidden for good and nobody leaves the page.
describe("ProfileTagChips — more tags than the row should carry", () => {
  // One voucher each, so a chip's text is its name alone (a count shows from two).
  const one = (name: string) => ({ ...tag(name), applications: 1 });
  const many = (n: number) => Array.from({ length: n }, (_, i) => one(`Tag ${i + 1}`));
  const names = () => screen.getAllByTestId("share-tag-chip").map((c) => c.textContent);
  beforeEach(() => {
    phone = false;
  });

  // Six chips fill one line of a desktop profile and three of a phone's.
  it("shows the first four on a phone, where a chip takes a third of a line", () => {
    phone = true;
    tags = many(10);
    render(<ProfileTagChips pubkey={PK} canTag />);
    expect(names()).toEqual(["Tag 1", "Tag 2", "Tag 3", "Tag 4"]);
    expect(screen.getByTestId("share-tags-more")).toHaveTextContent("+6 more");
  });

  it("shows the first six, and offers the rest by how many there are", () => {
    tags = many(10);
    render(<ProfileTagChips pubkey={PK} canTag />);
    expect(names()).toEqual(["Tag 1", "Tag 2", "Tag 3", "Tag 4", "Tag 5", "Tag 6"]);
    const more = screen.getByTestId("share-tags-more");
    expect(more).toHaveTextContent("+4 more");
    expect(more).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the rest in place, and closes them again", () => {
    tags = many(10);
    render(<ProfileTagChips pubkey={PK} canTag />);
    fireEvent.click(screen.getByTestId("share-tags-more"));
    expect(names()).toHaveLength(10);
    const less = screen.getByTestId("share-tags-more");
    expect(less).toHaveTextContent("Show less");
    expect(less).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(less);
    expect(names()).toHaveLength(6);
  });

  it("keeps the order: chips, then more, then the way to add one", () => {
    tags = many(10);
    render(<ProfileTagChips pubkey={PK} canTag />);
    const after = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const more = screen.getByTestId("share-tags-more");
    expect(after(screen.getAllByTestId("share-tag-chip").at(-1)!, more)).toBe(true);
    expect(after(more, screen.getByTestId("share-add-tag"))).toBe(true);
  });

  it("doesn't hide a single tag behind a button the size of a tag", () => {
    tags = many(7);
    render(<ProfileTagChips pubkey={PK} canTag />);
    expect(names()).toHaveLength(7);
    expect(screen.queryByTestId("share-tags-more")).toBeNull();
  });

  // The tag you just added, or one of yours, is the one you look for: behind "more" it
  // would read as "it didn't work".
  it("never hides a tag of your own, or one still publishing", () => {
    tags = [...many(8), { ...one("Mine"), myStance: "apply" }, { ...one("Just added"), pending: true }];
    render(<ProfileTagChips pubkey={PK} canTag />);
    expect(names()).toEqual(["Tag 1", "Tag 2", "Tag 3", "Tag 4", "Tag 5", "Tag 6", "Mine", "Just added"]);
    expect(screen.getByTestId("share-tags-more")).toHaveTextContent("+2 more");
  });
});
