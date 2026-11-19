/**
 * "Tagged as" — the network's tags on a person, and the way to add one. The
 * same row a post has (NoteTagChips): label, chips, then the dashed "Tag this
 * profile" button, so tagging reads as one thing wherever it is. The button was
 * once a quiet "+ Tag" beside the hashtags (2026-09-08); it came back here when
 * tagging was unified (2026-11-19).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileTagChips } from "./ProfileTagChips";

let tags: unknown[] = [];
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
