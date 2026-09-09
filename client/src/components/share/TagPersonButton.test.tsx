/**
 * The "+ Tag" picker on a profile. Its "Already on this profile" group listed
 * every existing tag twice — an Agree row and a Disagree row — so five tags
 * became ten rows before anything new (david's profile, 2026-09-08). One row
 * per tag now, with the tag page's Agree and thumbs-down inline.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TagPersonButton } from "./TagPersonButton";

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const applyMock = vi.fn(async (_vars: unknown) => ({}));
let tags: unknown[] = [];
vi.mock("@/hooks/useTags", () => ({
  useProfileTags: () => ({ data: { tags } }),
  useApplyTag: () => ({ mutateAsync: applyMock, isPending: false }),
  usePickerTags: () => ({ data: [] }),
}));
vi.mock("@/services/tags", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/services/tags")>()), resolveOrMintTag: vi.fn() }));

const PK = "a".repeat(64);
const AUTHOR = "b".repeat(64);
const tag = (name: string, myStance?: "apply" | "dispute") => ({ key: `${AUTHOR}|${name.toLowerCase()}`, name, slug: name.toLowerCase(), authorPubkey: AUTHOR, counted: true, selfDeclared: false, subjectDisagreed: false, myStance, applications: 3, disputes: 0, asserters: [], addedAt: 1 });

beforeAll(() => {
  // cmdk scrolls the selected row into view; jsdom has no layout.
  Element.prototype.scrollIntoView = () => {};
});
beforeEach(() => {
  applyMock.mockClear();
  toast.mockClear();
});

const openPicker = async () => {
  fireEvent.click(screen.getByTestId("share-add-tag"));
  return screen.findByTestId("share-tag-search");
};

describe("TagPersonButton — tags already on the profile", () => {
  it("each existing tag is one row, with Agree and Disagree side by side", async () => {
    tags = [tag("Verified Human"), tag("Neurologist")];
    render(<TagPersonButton pubkey={PK} variant="link" />);
    await openPicker();
    const rows = screen.getAllByTestId("share-tag-stance");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Verified Human");
    expect(within(rows[0]).getByTestId("share-tag-stance-vote-agree")).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("share-tag-stance-vote-disagree")).toBeInTheDocument();
  });

  it("the thumbs-down publishes a disagreement; the row itself agrees", async () => {
    tags = [tag("Verified Human")];
    render(<TagPersonButton pubkey={PK} variant="link" />);
    await openPicker();
    const row = screen.getByTestId("share-tag-stance");
    fireEvent.click(within(row).getByTestId("share-tag-stance-vote-disagree"));
    await waitFor(() => expect(applyMock).toHaveBeenCalledWith(expect.objectContaining({ polarity: -1, tag: { authorPubkey: AUTHOR, slug: "verified human" } })));
  });

  it("the stance you already hold is shown, not offered again", async () => {
    tags = [tag("Verified Human", "apply")];
    render(<TagPersonButton pubkey={PK} variant="link" />);
    await openPicker();
    const row = screen.getByTestId("share-tag-stance");
    const agree = within(row).getByTestId("share-tag-stance-vote-agree");
    expect(agree).toHaveTextContent("Agreed");
    expect(agree).toBeDisabled();
    fireEvent.click(agree);
    expect(applyMock).not.toHaveBeenCalled();
  });
});
