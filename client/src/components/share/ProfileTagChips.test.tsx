/**
 * "Known for" — the network's tags on a person. It used to show its label and
 * a dotted "Add a tag" pill to any signed-in tagger even with nothing to show:
 * a form control in the identity block (Benjamin, 2026-09-08). The row is
 * display only now; the way in lives beside the "Posts about" chips.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileTagChips } from "./ProfileTagChips";

let tags: unknown[] = [];
vi.mock("@/hooks/useTags", () => ({ useProfileTags: () => ({ data: { tags } }) }));
vi.mock("@/components/share/TagPersonButton", () => ({ TagPersonButton: () => <button data-testid="share-add-tag">Add a tag</button> }));

const PK = "a".repeat(64);
const tag = (name: string) => ({ key: name, name, slug: name.toLowerCase(), authorPubkey: "b".repeat(64), counted: true, selfDeclared: false, subjectDisagreed: false, myStance: null, applications: 3, description: "" });

describe("ProfileTagChips", () => {
  it("with no tags there is no row — not even for someone who could add one", () => {
    tags = [];
    render(<ProfileTagChips pubkey={PK} canTag />);
    expect(screen.queryByTestId("share-tags")).toBeNull();
    expect(screen.queryByTestId("share-add-tag")).toBeNull();
  });

  it("with tags, the chips — and no add pill in the row", () => {
    tags = [tag("Musician"), tag("Builder")];
    render(<ProfileTagChips pubkey={PK} canTag />);
    const row = screen.getByTestId("share-tags");
    expect(row).toHaveTextContent("Known for");
    expect(screen.getAllByTestId("share-tag-chip")).toHaveLength(2);
    expect(screen.queryByTestId("share-add-tag")).toBeNull();
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
});
